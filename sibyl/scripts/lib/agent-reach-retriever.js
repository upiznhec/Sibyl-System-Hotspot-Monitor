const { spawn } = require('child_process');
const crypto = require('crypto');

const {
  capabilityAvailability,
  listCapabilities,
  listDueProbes,
  loadHealthState,
  normalizePolicy,
  recordFailure,
  recordSuccess,
  saveHealthState
} = require('./retrieval-health');

const DEFAULT_OPTIONS = {
  enabled: true,
  command: 'openclaw',
  agent: 'sibyl-retriever',
  sessionFlag: 'none',
  timeoutSeconds: 90,
  thinking: 'low',
  minSources: 2,
  minConfidence: 'medium',
  maxSources: 4,
  maxAgeHours: 96,
  maxEvidenceChars: 6000,
  allowTrustedSingleSource: true,
  trustedDomains: [
    'cctv.com',
    'xinhuanet.com',
    'news.cn',
    'fifa.com',
    'uefa.com',
    'the-afc.com',
    'olympics.com',
    'nba.com'
  ],
  capabilities: [
    'browser.search'
  ]
};
const MAX_AGENT_OUTPUT_CHARS = 2 * 1024 * 1024;
let agentRunQueue = Promise.resolve();
const ROUTE_ALIASES = {
  weibo_search: 'weibo.search',
  'weibo-search': 'weibo.search',
  browser: 'browser.search',
  'browser+web_fetch': 'browser.search',
  'browser+web-fetch': 'browser.search',
  'web-search-skill': 'web_fetch.search',
  'web-search': 'web_fetch.search',
  web_search: 'web_fetch.search',
  web_fetch: 'web_fetch.search',
  'jina-search': 'jina.search',
  jina_search: 'jina.search',
  'exa-search': 'exa.search',
  exa_search: 'exa.search'
};

function mergedOptions(config = {}) {
  const configured = config.alerts?.agentReachSummary || {};
  const capabilities = configured.capabilities ||
    config.retrieval?.summaryCapabilities ||
    DEFAULT_OPTIONS.capabilities;
  return {
    ...DEFAULT_OPTIONS,
    ...configured,
    capabilities: Array.isArray(capabilities)
      ? capabilities.filter(Boolean)
      : DEFAULT_OPTIONS.capabilities
  };
}

function agentCapabilityId(options) {
  const agent = String(options.agent || DEFAULT_OPTIONS.agent)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  return agent === 'main' ? 'openclaw.agent' : `openclaw.agent.${agent}`;
}

function beijingTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function sessionKey(signal) {
  const date = new Date().toISOString().slice(0, 10);
  const source = `${signal.platform || ''}:${signal.title || ''}:${date}`;
  const digest = crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
  return `sibyl-summary-${digest}`;
}

function routeInstruction(capability) {
  if (capability === 'browser.search') {
    return '使用browser搜索话题并提取原始来源URL，再用web_fetch读取正文；不要读取Agent Reach Skill。';
  }
  if (capability === 'web_fetch.search') {
    return '使用OpenClaw内置web_fetch读取搜索结果页和来源文章；不要尝试Jina或Exa。';
  }
  if (capability === 'jina.search') {
    return '按Agent Reach的Jina Reader路径检索并读取网页；不要尝试Exa。';
  }
  if (capability === 'exa.search') {
    return '按Agent Reach的Exa路径检索并读取来源。';
  }
  return `仅使用检索能力 ${capability}。`;
}

function buildRetrievalPrompt(signal, routes, options = {}) {
  const primary = routes[0];
  const fallback = routes[1] || '';
  const platform = signal.platformLabel || signal.platform || '未知平台';
  const category = signal.category || signal.classification?.category || '未知';
  const detailUrl = signal.url || '';
  const relatedTitles = [...new Set(signal.relatedTitles || [])]
    .filter(title => title && title !== signal.title)
    .slice(0, 12);

  return `你是Sibyl System的联网取材子任务，只负责寻找可靠事实材料，不负责生成最终摘要。

直接使用OpenClaw工具完成取材。禁止读取Agent Reach或其他Skill文件，不要依赖模型记忆。

【任务】
话题：${signal.title || '未知话题'}
平台：${platform}
品类：${category}
平台详情链接：${detailUrl || '无'}
同一事件线的相关话题词：${relatedTitles.length ? relatedTitles.join('；') : '无'}
当前北京时间：${beijingTimestamp()}

【能力限制】
首选能力：${primary}
首选说明：${routeInstruction(primary)}
备用能力：${fallback || '无'}
最多尝试首选和一个备用能力，不得遍历其他后端。
首选失败时才允许使用备用能力。
返回JSON中的routeUsed和attempts[].capability必须原样使用上述能力标识，只能填写${routes.map(route => `"${route}"`).join('或')}，不得填写Skill名称或自行创造名称。

【取材要求】
1. 先把话题拆成主体、动作/结果、赛事或产品、阶段/版本、时间五类要素，不要只照抄完整热搜词搜索。
2. 至少依次尝试：完整话题词；主体+动作/结果；主体+赛事/产品+阶段；相关话题词；必要时补充主体或赛事的中英文名称。完整话题无结果时必须尝试简化词，不能立即结束。
3. 体育和电竞事件必须区分小组赛、淘汰赛、赛前、赛后等阶段，并核对发布日期。不同阶段的“出线”和“出局”不构成矛盾。
4. 游戏事件必须区分官宣、爆料、上线、更新和玩家讨论；不能用旧版本信息否定新版本事件。
5. 优先最近${options.maxAgeHours || DEFAULT_OPTIONS.maxAgeHours}小时内的赛事官方、球队/选手官方、厂商公告、新华社、路透社、央视及其他可靠媒体。
6. 浏览器搜索结果页、百度跳转链接和聚合页只能作为线索，必须打开原始来源；它们不能作为最终sources。weibo_search返回的媒体账号原帖可以作为平台来源。
7. 首选路径返回无关结果、只有跳转页或无法支持核心事实时，记为no_results并尝试备用能力。
8. 至少找到${options.minSources || DEFAULT_OPTIONS.minSources}个不同域名的独立来源，核心事实应能交叉印证；权威原始单源按下方例外处理。
9. 平台热榜词只能证明话题正在传播，不能据此编造视频画面、文案、人物表态、比分或时间。
10. 不修改任何文件或配置，不运行Sibyl脚本，不调用Webhook，不发送消息。
11. 不输出最终摘要，不给市场建议，只返回结构化取材结果。

【主张状态】
- supported：核心主张已被可靠材料支持。
- partially_supported：只能确认部分事实。sources和verifiedFacts中只保留已确认部分，不得把未证实部分写成事实。
- contradicted：同一时间点、同一阶段的可靠材料明确否定核心主张。
- unresolved：没有足够相关材料判断。无关搜索结果不能算contradicted。

【可信度判断】
- high：至少两个独立可靠来源交叉印证，核心事实完整且一致。
- medium：至少两个独立来源支持核心事实，但部分次要信息缺失。
- 如果唯一来源是赛事组织、政府机构、球队/选手官方或权威央媒的原始发布，且它直接支持全部核心事实，可以返回medium；不得将转载、自媒体或聚合页按此例外处理。
- low：只有单一来源、来源相关性不足、核心事实存在冲突，或无法完成交叉验证。
- 不得因为检索工具不稳定而降低事实可信度；工具失败应写入attempts。

【JSON格式】
{
  "success": true,
  "routeUsed": "${primary}",
  "attempts": [
    {
      "capability": "${primary}",
      "status": "success|failed|no_results|pending",
      "failureType": "timeout|network|rate_limit|parse|auth|forbidden|anti_bot|not_configured|no_results|page_error|pending|unknown",
      "reason": "",
      "latencyMs": 0
    }
  ],
  "sources": [
    {
      "name": "来源名称",
      "publishedAt": "可核实的发布时间，未知则留空",
      "url": "https://...",
      "verifiedFacts": ["可被来源直接支持的事实"]
    }
  ],
  "claimStatus": "supported|partially_supported|contradicted|unresolved",
  "confidence": "high|medium|low",
  "failureReason": null
}

【强制输出要求】
1. 输出必须是一个合法JSON对象，并且能够被JSON.parse直接解析。
2. 第一个字符必须是{，最后一个字符必须是}。
3. 不要使用Markdown代码块，不要添加标题、解释、总结或分析。
4. 所有字符串必须使用双引号，不能使用注释或尾随逗号。
5. CRITICAL：JSON前后不得出现任何文字，即使工具失败也只能返回JSON。

输出示例：
{"success":true,"routeUsed":"${primary}","attempts":[{"capability":"${primary}","status":"success","failureType":"","reason":"","latencyMs":1000}],"sources":[{"name":"来源名称","publishedAt":"","url":"https://example.com/article","verifiedFacts":["可核实事实"]}],"claimStatus":"supported","confidence":"medium","failureReason":null}`;
}

function runAgentOnce(prompt, options = {}, sessionFlag = 'session-id') {
  return new Promise(resolve => {
    const command = options.command || DEFAULT_OPTIONS.command;
    const timeoutSeconds = Number(options.timeoutSeconds) || DEFAULT_OPTIONS.timeoutSeconds;
    const args = [
      'agent',
      '--agent', options.agent || DEFAULT_OPTIONS.agent,
      '--message', prompt,
      '--thinking', options.thinking || DEFAULT_OPTIONS.thinking,
      '--timeout', String(timeoutSeconds),
      '--json'
    ];
    if (sessionFlag !== 'none') {
      args.splice(3, 0, `--${sessionFlag}`, options.sessionKey);
    }
    if (options.local === true) args.push('--local');

    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer = null;
    let timeoutTimer = null;
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        ...result,
        stdout,
        stderr,
        latencyMs: Date.now() - startedAt
      });
    };

    child.stdout.on('data', chunk => {
      if (stdout.length < MAX_AGENT_OUTPUT_CHARS) {
        stdout += chunk.toString().slice(0, MAX_AGENT_OUTPUT_CHARS - stdout.length);
      }
    });
    child.stderr.on('data', chunk => {
      if (stderr.length < MAX_AGENT_OUTPUT_CHARS) {
        stderr += chunk.toString().slice(0, MAX_AGENT_OUTPUT_CHARS - stderr.length);
      }
    });
    child.on('error', error => {
      finish({
        success: false,
        failureType: error.code === 'ENOENT' ? 'not_configured' : 'network',
        error: error.message
      });
    });
    child.on('close', code => {
      if (killTimer) clearTimeout(killTimer);
      if (code === 0) {
        finish({ success: true });
      } else {
        finish({
          success: false,
          failureType: 'unknown',
          exitCode: code,
          error: `openclaw agent退出码 ${code}`
        });
      }
    });

    timeoutTimer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        success: false,
        failureType: 'timeout',
        error: `openclaw agent超过${timeoutSeconds + 10}秒未完成`
      });
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      killTimer.unref?.();
    }, (timeoutSeconds + 10) * 1000);
  });
}

function unsupportedSessionFlag(result) {
  if (result.success) return false;
  const output = `${result.stderr || ''}\n${result.stdout || ''}\n${result.error || ''}`;
  return /unknown option|unknown argument|unrecognized option|unexpected argument|not a valid option/i.test(output) &&
    /session-(?:id|key)/i.test(output);
}

async function runAgentWithCompatibility(prompt, options = {}) {
  const preferred = ['session-id', 'session-key'].includes(options.sessionFlag)
    ? options.sessionFlag
    : 'none';
  const first = await runAgentOnce(prompt, options, preferred);
  if (preferred !== 'none' && unsupportedSessionFlag(first)) {
    const fallback = preferred === 'session-id' ? 'session-key' : 'session-id';
    return runAgentOnce(prompt, options, fallback);
  }
  if (!first.success && first.exitCode === 1) {
    const delayMs = Math.max(0, Number(options.retryDelayMs) || 1000);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return runAgentOnce(prompt, options, preferred);
  }
  return first;
}

function runAgent(prompt, options = {}) {
  const task = agentRunQueue.then(() => runAgentWithCompatibility(prompt, options));
  agentRunQueue = task.catch(() => {});
  return task;
}

function payloadTexts(value, results = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => payloadTexts(item, results, seen));
    return results;
  }
  if (typeof value.text === 'string') results.push(value.text);
  if (typeof value.content === 'string') results.push(value.content);
  Object.values(value).forEach(item => payloadTexts(item, results, seen));
  return results;
}

function parseJsonObject(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (innerError) {
      return null;
    }
  }
}

function extractJsonObjects(text) {
  const source = String(text || '');
  const results = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth++;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          results.push(JSON.parse(source.slice(start, index + 1)));
        } catch (error) {
          // Keep scanning in case a later object is valid.
        }
        start = -1;
      }
    }
  }
  return results;
}

function parsedObjects(text) {
  const direct = parseJsonObject(text);
  if (direct) return [direct];
  return extractJsonObjects(text);
}

function parseAgentOutput(stdout) {
  const envelopes = parsedObjects(stdout);
  for (const envelope of envelopes) {
    if (envelope?.sources || envelope?.success === false) return envelope;
    for (const text of payloadTexts(envelope)) {
      for (const parsed of parsedObjects(text)) {
        if (parsed?.sources || parsed?.success === false) return parsed;
      }
    }
  }
  return null;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol === 'sinaweibo:' && parsed.hostname === 'detail') {
      const mblogId = parsed.searchParams.get('mblogid');
      return mblogId ? `https://weibo.com/detail/${encodeURIComponent(mblogId)}` : '';
    }
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : '';
  } catch (e) {
    return '';
  }
}

function normalizeSources(sources, maxSources) {
  const normalized = [];
  const seenUrls = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = normalizeUrl(source?.url);
    const facts = (Array.isArray(source?.verifiedFacts) ? source.verifiedFacts : [])
      .map(fact => String(fact || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!url || !facts.length || seenUrls.has(url)) continue;
    seenUrls.add(url);
    normalized.push({
      name: String(source?.name || new URL(url).hostname).trim(),
      publishedAt: String(source?.publishedAt || '').trim(),
      url,
      verifiedFacts: facts
    });
    if (normalized.length >= maxSources) break;
  }
  return normalized;
}

function independentDomainCount(sources) {
  const compoundSuffixes = new Set(['com.cn', 'net.cn', 'org.cn', 'gov.cn']);
  return new Set(sources.map(source => {
    try {
      const hostname = new URL(source.url).hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      const suffix = parts.slice(-2).join('.');
      return compoundSuffixes.has(suffix)
        ? parts.slice(-3).join('.')
        : parts.slice(-2).join('.');
    } catch (e) {
      return '';
    }
  }).filter(Boolean)).size;
}

function sourceIdentity(source) {
  try {
    const parsed = new URL(source.url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const weiboMatch = parsed.pathname.match(/^\/detail\/([^/]+)/);
    if ((hostname === 'weibo.com' || hostname.endsWith('.weibo.com')) && weiboMatch) {
      const publisher = String(source.name || '').replace(/\s+/g, '').toLowerCase();
      return publisher ? `weibo:${publisher}` : `weibo-post:${weiboMatch[1]}`;
    }
  } catch (error) {
    return '';
  }
  return '';
}

function independentSourceCount(sources) {
  const platformSources = new Set(sources.map(sourceIdentity).filter(Boolean));
  const webSources = sources.filter(source => !sourceIdentity(source));
  return platformSources.size + independentDomainCount(webSources);
}

function onlyWeiboSources(sources) {
  return sources.length > 0 && sources.every(source => {
    try {
      const hostname = new URL(source.url).hostname.replace(/^www\./, '');
      return hostname === 'weibo.com' || hostname.endsWith('.weibo.com');
    } catch (error) {
      return false;
    }
  });
}

function sourceHostname(source) {
  try {
    return new URL(source.url).hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

function isTrustedSource(source, trustedDomains) {
  const hostname = sourceHostname(source);
  return (Array.isArray(trustedDomains) ? trustedDomains : [])
    .map(domain => String(domain || '').toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
    .some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function evidenceText(sources, maxChars, claimStatus = 'supported') {
  const text = [
    `主张核验状态：${claimStatus}`,
    claimStatus === 'partially_supported'
      ? '摘要只能使用下列已核实事实，不得补写话题标题中未被材料支持的部分。'
      : '摘要只能使用下列来源直接支持的事实。',
    '',
    ...sources.map(source => [
    `[来源] ${source.name}`,
    `发布时间：${source.publishedAt || '未知'}`,
    `原始链接：${source.url}`,
    `有效信息：${source.verifiedFacts.join('；')}`
    ].join('\n'))
  ].join('\n\n');
  return text.slice(0, maxChars);
}

function relatedCapabilityIds(routes) {
  const ids = new Set(routes);
  routes.forEach(route => {
    if (route.endsWith('.search')) ids.add(route.replace(/\.search$/, '.read'));
  });
  return ids;
}

function normalizeRouteId(id) {
  const value = String(id || '').trim();
  return ROUTE_ALIASES[value] || value;
}

function updateAttemptHealth(state, attempts, policy, allowedIds) {
  for (const attempt of Array.isArray(attempts) ? attempts : []) {
    const id = normalizeRouteId(attempt?.capability);
    if (!id || !allowedIds.has(id)) continue;
    const status = String(attempt?.status || '').toLowerCase();
    if (status === 'success') {
      recordSuccess(state, id, { policy, latencyMs: attempt.latencyMs });
      continue;
    }
    recordFailure(state, id, {
      policy,
      failureType: attempt.failureType || (status === 'no_results' ? 'no_results' : 'unknown'),
      reason: attempt.reason,
      latencyMs: attempt.latencyMs
    });
  }
}

function normalizedFailureReason(result) {
  const reason = String(result?.failureReason || '').trim();
  if (/分析中|处理中|pending|in[ _-]?progress/i.test(reason)) {
    return 'weibo_analysis_pending';
  }
  return reason;
}

function availableRoutes(state, ids) {
  const normal = listCapabilities(state, ids)
    .filter(item => item.availability.canUse)
    .map(item => item.id);
  if (normal.length) return { routes: normal.slice(0, 2), probeMode: false };

  const due = listDueProbes(state, ids).map(item => item.id);
  return { routes: due.slice(0, 1), probeMode: due.length > 0 };
}

function updateHealthState(stateOptions, mutation) {
  const latest = loadHealthState(stateOptions);
  mutation(latest);
  saveHealthState(latest, stateOptions);
  return latest;
}

async function retrieveAgentReachEvidence(signal, config = {}, dependencies = {}) {
  const options = mergedOptions(config);
  if (!options.enabled) {
    return { success: false, failureReason: 'agent_reach_disabled' };
  }

  const stateOptions = dependencies.stateOptions || {};
  const state = loadHealthState(stateOptions);
  const policy = normalizePolicy(config.retrieval?.health);
  const agentCapability = agentCapabilityId(options);
  const agentHealth = state.capabilities[agentCapability];
  if (agentHealth) {
    const availability = capabilityAvailability(agentHealth);
    const legacyParseOpen = agentHealth.lastFailureType === 'parse' ||
      agentHealth.lastFailureReason === 'agent_json_unparseable';
    const confirmationTrial = agentHealth.status === 'suspect';
    if (!availability.canUse && !availability.probeDue &&
        !legacyParseOpen && !confirmationTrial) {
      return { success: false, failureReason: `openclaw_agent_${availability.reason}` };
    }
  }

  const routeSelection = availableRoutes(state, options.capabilities);
  if (!routeSelection.routes.length) {
    return { success: false, failureReason: 'no_healthy_retrieval_route' };
  }

  const prompt = buildRetrievalPrompt(signal, routeSelection.routes, options);
  const runner = dependencies.runAgent || runAgent;
  const runResult = await runner(prompt, {
    ...options,
    sessionKey: sessionKey(signal)
  });

  if (!runResult.success) {
    updateHealthState(stateOptions, latest => {
      recordFailure(latest, agentCapability, {
        policy,
        failureType: runResult.failureType || 'unknown',
        reason: runResult.error,
        latencyMs: runResult.latencyMs
      });
    });
    return {
      success: false,
      failureReason: runResult.error || 'openclaw_agent_failed'
    };
  }

  // A zero exit means the Agent transport is available. Output validation is separate.
  updateHealthState(stateOptions, latest => {
    recordSuccess(latest, agentCapability, {
      policy,
      latencyMs: runResult.latencyMs
    });
  });

  const result = parseAgentOutput(runResult.stdout);
  if (!result) {
    return { success: false, failureReason: 'agent_json_unparseable' };
  }

  const routeUsed = normalizeRouteId(result.routeUsed || routeSelection.routes[0]);
  if (!routeSelection.routes.includes(routeUsed)) {
    return {
      success: false,
      routeUsed,
      failureReason: 'agent_route_violation'
    };
  }

  updateHealthState(stateOptions, latest => {
    updateAttemptHealth(
      latest,
      result.attempts,
      policy,
      relatedCapabilityIds(routeSelection.routes)
    );
  });

  const sources = normalizeSources(result.sources, options.maxSources);
  const enoughIndependentSources = sources.length >= options.minSources &&
    independentSourceCount(sources) >= options.minSources;
  const trustedSingleSource = options.allowTrustedSingleSource !== false &&
    sources.length === 1 &&
    isTrustedSource(sources[0], options.trustedDomains);
  const enoughSources = enoughIndependentSources || trustedSingleSource;
  const confidenceOrder = { low: 1, medium: 2, high: 3 };
  const reportedConfidence = confidenceOrder[result.confidence] ? result.confidence : 'medium';
  let confidence = trustedSingleSource && reportedConfidence === 'low'
    ? 'medium'
    : reportedConfidence;
  if (onlyWeiboSources(sources) && confidence === 'high') confidence = 'medium';
  const enoughConfidence = confidenceOrder[confidence] >=
    (confidenceOrder[options.minConfidence] || confidenceOrder.medium);
  const claimStatus = ['supported', 'partially_supported', 'contradicted', 'unresolved']
    .includes(result.claimStatus)
    ? result.claimStatus
    : (result.success ? 'supported' : 'unresolved');
  const acceptableClaim = claimStatus === 'supported' ||
    claimStatus === 'partially_supported';
  const reportedFailureReason = normalizedFailureReason(result);

  if (!result.success || !acceptableClaim || !enoughSources || !enoughConfidence) {
    if (!Array.isArray(result.attempts) || !result.attempts.length) {
      updateHealthState(stateOptions, latest => {
        recordFailure(latest, routeUsed, {
          policy,
          failureType: 'no_results',
          reason: reportedFailureReason || 'insufficient_independent_sources'
        });
      });
    }
    return {
      success: false,
      routeUsed,
      sources,
      confidence,
      claimStatus,
      retryable: reportedFailureReason === 'weibo_analysis_pending',
      failureReason: reportedFailureReason ||
        (claimStatus === 'contradicted'
          ? 'claim_contradicted'
          : (claimStatus === 'unresolved'
            ? 'claim_unresolved'
            : (!sources.length
          ? 'no_valid_sources'
          : (!enoughSources ? 'insufficient_independent_sources' : 'low_confidence'))))
    };
  }

  if (!Array.isArray(result.attempts) || !result.attempts.length) {
    updateHealthState(stateOptions, latest => {
      recordSuccess(latest, routeUsed, { policy });
    });
  }
  return {
    success: true,
    routeUsed,
    probeMode: routeSelection.probeMode,
    confidence,
    claimStatus,
    confidenceBasis: trustedSingleSource
      ? 'trusted_single_source'
      : (onlyWeiboSources(sources) ? 'independent_weibo_publishers' : 'independent_sources'),
    sources,
    evidenceText: evidenceText(sources, options.maxEvidenceChars, claimStatus)
  };
}

module.exports = {
  buildRetrievalPrompt,
  parseAgentOutput,
  retrieveAgentReachEvidence,
  runAgent
};
