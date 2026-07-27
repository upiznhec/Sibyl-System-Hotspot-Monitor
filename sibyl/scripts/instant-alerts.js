#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const { collectSnapshot } = require('./collect-snapshot');
const {
  buildDouyinHotListEvidence,
  retrieveDouyinTopicEvidence
} = require('./lib/douyin-topic');
const { retrieveAgentReachEvidence } = require('./lib/agent-reach-retriever');
const { getWeiboTokenResult, searchWeiboAIResult } = require('./lib/weibo-wis');
const { classifySignal } = require('./lib/category-classifier');
const { formatHeat, normalizeForCompare } = require('./lib/signals');
const { callAIModel, summarizeContent } = require('../../elixir-summarizer/scripts/elixir-summarizer');
const {
  beijingDateKey,
  beijingTimeShort,
  getDataDir,
  loadLatestSnapshot,
  mergeConfig,
  readJson,
  snapshotToSignals,
  writeJsonAtomic
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  filters: {
    allowedCategories: ['游戏', '电竞', '体育', 'AI']
  },
  snapshot: {
    maxAgeMinutes: 20
  },
  alerts: {
    enabled: true,
    pushWeCom: false,
    webhook: '',
    dedupe: 'daily',
    summaries: true,
    douyinTopic: {
      enabled: true,
      directPageEnabled: false,
      relatedTopicLimit: 8,
      timeout: 12000,
      retries: 0
    },
    agentReachSummary: {
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
      capabilities: [
        'browser.search'
      ]
    },
    aiSearchSummary: {
      enabled: false,
      maxChars: 110
    },
    weiboAI: {
      appId: '',
      appSecret: '',
      authUrl: 'https://open-im.api.weibo.com/open/auth/ws_token',
      searchUrl: 'https://open-im.api.weibo.com/open/wis/search_query'
    },
    platforms: {
      weibo: {
        enabled: true,
        rankMax: 10,
        hotMin: 500000
      },
      douyin: {
        enabled: true,
        rankMax: 10,
        hotMin: 8000000
      }
    }
  },
  report: {
    webhook: ''
  }
};

const PLATFORM_LABELS = {
  weibo: '微博',
  douyin: '抖音'
};

const AI_SEARCH_SUMMARY_PROMPT = `你是热点即时预警摘要助手。请围绕以下热榜话题搜索公开信息，并生成一段简洁摘要。

【必须遵守】
1. 你必须基于可检索到的公开信息生成摘要；如果当前环境无法联网搜索、没有搜索结果、搜索结果不足或信息不明确，只返回：暂无摘要
2. 不要凭话题标题猜测，不要编造比赛结果、人物表态、数据、时间、机构结论。
3. 摘要控制在60-100字，最多不超过{maxChars}字。
4. 摘要面向用增市场阅读者，重点说明：发生了什么、为什么被讨论、是否适合作为内容入口观察。
5. 不输出分析过程、来源列表、标题、引号或Markdown，只输出摘要正文。
6. 如果搜索到的信息显示该话题是商业推广、财经、汽车、手机、电商等非游戏/电竞/体育/AI内容，返回：暂无摘要

话题：{topic}
平台：{platform}

请直接输出摘要正文。`;

function loadConfig() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  return mergeConfig(DEFAULT_CONFIG, readJson(configFile, {}));
}

function stateFile() {
  return path.join(getDataDir(), 'alerts-state.json');
}

function summaryFile() {
  return path.join(getDataDir(), 'alert-summaries.json');
}

function loadState() {
  const state = readJson(stateFile(), { reported: {} });
  if (!state.reported || typeof state.reported !== 'object') state.reported = {};
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  Object.keys(state.reported).forEach(key => {
    const reportedAt = new Date(state.reported[key]?.reportedAt || state.reported[key]).getTime();
    if (!reportedAt || reportedAt < sevenDaysAgo) delete state.reported[key];
  });
  return state;
}

function saveState(state) {
  writeJsonAtomic(stateFile(), state);
}

function loadSummaryCache() {
  const cache = readJson(summaryFile(), {});
  return cache && typeof cache === 'object' ? cache : {};
}

function saveSummaryCache(cache) {
  writeJsonAtomic(summaryFile(), cache);
}

function parsePlatforms(args) {
  const platformArg = args.find(arg => arg.startsWith('--platform='));
  if (!platformArg) return ['weibo', 'douyin'];
  return platformArg.replace('--platform=', '').split(',').map(item => item.trim()).filter(Boolean);
}

function legacyStateFile(platform) {
  const openclawWorkspace = '/root/.openclaw/workspace';
  if (!fs.existsSync(openclawWorkspace)) return null;
  const dir = platform === 'weibo' ? 'weibo-hot' : 'douyin-hot';
  return path.join(openclawWorkspace, 'data', dir, 'state.json');
}

function legacyHistoryFile(platform) {
  const openclawWorkspace = '/root/.openclaw/workspace';
  if (!fs.existsSync(openclawWorkspace)) return null;
  const dir = platform === 'weibo' ? 'weibo-hot' : 'douyin-hot';
  return path.join(openclawWorkspace, 'data', dir, 'history.json');
}

function legacyConfigWebhook() {
  const file = '/root/.openclaw/workspace/data/weibo-hot/config.json';
  const config = readJson(file, {});
  return config.weComWebhook || '';
}

function legacySummary(platform, title) {
  const file = legacyHistoryFile(platform);
  if (!file) return '';
  const history = readJson(file, {});
  const summary = history?.[title]?.summary || '';
  const isCommercial = history?.[title]?.isCommercial || /^\[商业广告\]/.test(summary);
  return summary && !isCommercial ? summary : '';
}

function wasLegacyReportedToday(platform, title, dateKey) {
  const file = legacyStateFile(platform);
  if (!file) return false;
  const state = readJson(file, {});
  const reportedAt = state.rule2Reported?.[title];
  return Boolean(reportedAt && beijingDateKey(reportedAt) === dateKey);
}

function dedupeKey(platform, title, dateKey) {
  return `${dateKey}:${platform}:${normalizeForCompare(title) || title}`;
}

function triggerType(signal, thresholds) {
  const hotTriggered = Number(signal.heat || 0) >= thresholds.hotMin;
  const rankTriggered = Number(signal.rank || 999) <= thresholds.rankMax;
  if (hotTriggered && rankTriggered) return '热度&位次规则';
  if (hotTriggered) return '热度规则';
  if (rankTriggered) return '位次规则';
  return '';
}

function detailLink(signal) {
  if (signal.url) return signal.url;
  if (signal.platform === 'weibo') {
    return `https://s.weibo.com/weibo?q=%23${encodeURIComponent(signal.title)}%23`;
  }
  if (signal.platform === 'douyin') {
    return `https://www.douyin.com/search/${encodeURIComponent(signal.title)}`;
  }
  return '';
}

function readOpenClawConfig() {
  try {
    return JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  } catch (e) {
    return {};
  }
}

function getModelConfig(customConfig = null) {
  if (customConfig?.ai && customConfig.ai.apiKey) return customConfig.ai;
  try {
    const config = readOpenClawConfig();
    return config.models?.providers?.aliyun || null;
  } catch (e) {
    return null;
  }
}

function normalizeSummary(summary) {
  const text = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!text || /^\[商业广告\]/.test(text)) return '';
  if (text === '暂无摘要') return '';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function buildAISearchSummaryPrompt(signal, options = {}) {
  return AI_SEARCH_SUMMARY_PROMPT
    .replace('{topic}', signal.title || '未知话题')
    .replace('{platform}', PLATFORM_LABELS[signal.platform] || signal.platformLabel || signal.platform || '未知平台')
    .replace('{maxChars}', String(options.maxChars || 110));
}

async function generateAISearchSummary(signal, context) {
  const options = context.aiSearchSummary || {};
  if (!options.enabled) return '';

  const modelConfig = getModelConfig(context.config);
  if (!modelConfig?.apiKey) return '';

  const result = await callAIModel(buildAISearchSummaryPrompt(signal, options), modelConfig, 1);
  if (!result.success) {
    console.log(`⚠️ AI搜索摘要失败: ${signal.title} - ${result.error || 'unknown error'}`);
    return '';
  }

  const summary = normalizeSummary(result.content);
  if (!summary) return '';

  if (/无法|不能|没有搜索|未找到|不足|不明确|作为AI|无法联网|无法访问/i.test(summary)) {
    return '';
  }

  return summary.length > (options.maxChars || 110)
    ? `${summary.slice(0, (options.maxChars || 110) - 3)}...`
    : summary;
}

async function buildAlertSummary(alert, context) {
  const signal = alert.signal;
  const cacheKey = `${signal.platform}:${normalizeForCompare(signal.title) || signal.title}`;
  const cached = normalizeSummary(context.summaryCache[cacheKey]?.summary);
  if (cached) return { summary: cached };

  const fromLegacy = normalizeSummary(legacySummary(signal.platform, signal.title));
  if (fromLegacy) {
    context.summaryCache[cacheKey] = {
      platform: signal.platform,
      title: signal.title,
      summary: fromLegacy,
      source: 'legacy-history',
      updatedAt: new Date().toISOString()
    };
    return { summary: fromLegacy };
  }

  if (!context.enableSummaries) return { summary: '暂无摘要' };

  if (signal.platform === 'douyin') {
    const douyinOptions = context.config.alerts?.douyinTopic || {};
    let douyinResult = douyinOptions.enabled === false
      ? { success: false, failureReason: 'douyin_topic_disabled' }
      : buildDouyinHotListEvidence(signal, context.snapshotSignals, douyinOptions);
    if (!douyinResult.success && douyinOptions.directPageEnabled === true) {
      douyinResult = await retrieveDouyinTopicEvidence(signal, douyinOptions);
    }
    if (douyinResult.success) {
      const elixirResult = await summarizeContent(douyinResult.evidenceText, signal.title);
      if (elixirResult.isCommercial) {
        return {
          filtered: true,
          reason: elixirResult.reason || 'Elixir判定为商业推广或非目标内容'
        };
      }
      const summary = normalizeSummary(elixirResult.summary);
      if (summary) {
        context.summaryCache[cacheKey] = {
          platform: signal.platform,
          title: signal.title,
          summary,
          source: `${douyinResult.source || 'douyin-topic'}-elixir`,
          sourceUrl: douyinResult.sourceUrl,
          evidenceCount: douyinResult.itemCount,
          updatedAt: new Date().toISOString()
        };
        return { summary };
      }
    } else {
      console.log(`⚠️ 抖音话题页未生成材料: ${signal.title} - ${douyinResult.failureReason}`);
    }
  }

  if (!context.weiboTokenChecked) {
    const tokenResult = await getWeiboTokenResult(context.config);
    context.weiboToken = tokenResult.token;
    context.weiboTokenChecked = true;
    if (!tokenResult.token) {
      console.log(`⚠️ 微博智搜鉴权不可用: ${tokenResult.reason || 'unknown'}`);
    }
  }
  const wisResult = await searchWeiboAIResult(signal.title, context.weiboToken, context.config);
  const rawContent = wisResult.content;
  if (!rawContent) {
    console.log(`⚠️ 微博智搜未生成材料: ${signal.title} - ${wisResult.reason || 'unknown'}`);
  }
  if (rawContent) {
    const elixirResult = await summarizeContent(rawContent, signal.title);
    if (elixirResult.isCommercial) {
      return {
        filtered: true,
        reason: elixirResult.reason || 'Elixir判定为商业推广或非目标内容'
      };
    }

    const summary = normalizeSummary(elixirResult.summary);
    if (summary) {
      context.summaryCache[cacheKey] = {
        platform: signal.platform,
        title: signal.title,
        summary,
        source: 'elixir',
        updatedAt: new Date().toISOString()
      };
      return { summary };
    }
  }

  if (context.agentReachSummary.enabled) {
    const retrieval = await retrieveAgentReachEvidence({
      ...signal,
      category: alert.category
    }, context.config);

    if (retrieval.success && retrieval.evidenceText) {
      const elixirResult = await summarizeContent(retrieval.evidenceText, signal.title);
      if (elixirResult.isCommercial) {
        return {
          filtered: true,
          reason: elixirResult.reason || 'Elixir判定为商业推广或非目标内容'
        };
      }

      const summary = normalizeSummary(elixirResult.summary);
      const invalidFallback = /^来源\b|^\[来源\]/.test(summary);
      if (summary && !invalidFallback) {
        context.summaryCache[cacheKey] = {
          platform: signal.platform,
          title: signal.title,
          summary,
          source: 'browser-elixir',
          retrievalRoute: retrieval.routeUsed,
          confidence: retrieval.confidence,
          sources: retrieval.sources,
          updatedAt: new Date().toISOString()
        };
        return { summary };
      }
    } else if (retrieval.failureReason) {
      console.log(`⚠️ 站外取材未生成摘要: ${signal.title} - ${retrieval.failureReason}`);
    }
  }

  const aiSearchSummary = await generateAISearchSummary(signal, context);
  if (aiSearchSummary) {
    context.summaryCache[cacheKey] = {
      platform: signal.platform,
      title: signal.title,
      summary: aiSearchSummary,
      source: 'ai-search',
      updatedAt: new Date().toISOString()
    };
    return { summary: aiSearchSummary };
  }

  return { summary: '暂无摘要' };
}

async function enrichAlertsWithSummaries(alerts, config, args, snapshotSignals = []) {
  const context = {
    enableSummaries: config.alerts?.summaries !== false && !args.includes('--no-summary'),
    agentReachSummary: {
      ...(config.alerts?.agentReachSummary || {}),
      enabled: config.alerts?.agentReachSummary?.enabled !== false &&
        !args.includes('--no-agent-reach-summary')
    },
    aiSearchSummary: {
      ...(config.alerts?.aiSearchSummary || {}),
      enabled: config.alerts?.aiSearchSummary?.enabled === true &&
        !args.includes('--no-ai-search-summary')
    },
    config,
    snapshotSignals,
    summaryCache: loadSummaryCache(),
    weiboToken: null,
    weiboTokenChecked: false
  };
  const enriched = [];

  for (const alert of alerts) {
    const result = await buildAlertSummary(alert, context);
    if (result.filtered) {
      console.log(`🚫 即时预警过滤: ${alert.signal.title} - ${result.reason}`);
      continue;
    }
    enriched.push({
      ...alert,
      summary: result.summary || '暂无摘要'
    });
  }

  saveSummaryCache(context.summaryCache);
  return enriched;
}

function buildMessage(alert, capturedAt) {
  const signal = alert.signal;
  const platformLabel = PLATFORM_LABELS[signal.platform] || signal.platformLabel || signal.platform;
  const link = detailLink(signal);
  const lines = [
    `🔥 ${platformLabel}高热度即时预警`,
    '━━━━━━━━━━━━━━',
    signal.title,
    `位次：#${signal.rank || '-'} ｜ 热度：${formatHeat(signal.heat)}`,
    `摘要：${alert.summary || '暂无摘要'}`,
    link ? `[查看详情](${link})` : '',
    '━━━━━━━━━━━━━━',
    `触发规则：${alert.triggerType}`,
    `触发时间：${beijingTimeShort(capturedAt)}`
  ].filter(Boolean);
  return lines.join('\n');
}

function sendWeComMessage(webhookUrl, message) {
  return new Promise((resolve) => {
    if (!webhookUrl) {
      resolve(false);
      return;
    }

    const url = new URL(webhookUrl);
    const data = JSON.stringify({
      msgtype: 'markdown',
      markdown: { content: message }
    });

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed.errcode === 0);
        } catch (e) {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(false);
    });
    req.write(data);
    req.end();
  });
}

function selectAlerts(snapshot, config, state, platforms) {
  const allowedCategories = new Set(config.filters?.allowedCategories || ['游戏', '电竞', '体育', 'AI']);
  const platformSet = new Set(platforms);
  const dateKey = beijingDateKey(snapshot.capturedAt);
  const alerts = [];

  for (const signal of snapshotToSignals(snapshot)) {
    if (!platformSet.has(signal.platform)) continue;
    const platformConfig = config.alerts?.platforms?.[signal.platform];
    if (!platformConfig || platformConfig.enabled === false) continue;

    const currentTriggerType = triggerType(signal, platformConfig);
    if (!currentTriggerType) continue;

    const classification = classifySignal(signal);
    if (!classification.category || !allowedCategories.has(classification.category)) continue;

    const key = dedupeKey(signal.platform, signal.title, dateKey);
    if (state.reported[key] || wasLegacyReportedToday(signal.platform, signal.title, dateKey)) {
      continue;
    }

    alerts.push({
      key,
      signal,
      category: classification.category,
      triggerType: currentTriggerType
    });
  }

  return alerts;
}

async function loadSnapshotForAlerts(config, args) {
  const maxAgeMinutes = config.snapshot?.maxAgeMinutes || 20;
  let snapshot = loadLatestSnapshot({ maxAgeMinutes });
  if (!snapshot && args.includes('--collect-if-stale')) {
    snapshot = await collectSnapshot({ args: [] });
  }
  return snapshot;
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  if (config.alerts?.enabled === false) {
    console.log('Sibyl 即时预警已在配置中关闭');
    return;
  }
  const platforms = parsePlatforms(args);
  const snapshot = await loadSnapshotForAlerts(config, args);

  if (!snapshot) {
    throw new Error('没有可用的Sibyl快照，请先运行 collect-snapshot.js');
  }

  const state = loadState();
  const selectedAlerts = selectAlerts(snapshot, config, state, platforms);
  const alerts = await enrichAlertsWithSummaries(
    selectedAlerts,
    config,
    args,
    snapshotToSignals(snapshot)
  );
  const webhook = process.env.SIBYL_ALERT_WEBHOOK ||
    process.env.WECOM_WEBHOOK ||
    config.alerts?.webhook ||
    config.report?.webhook ||
    legacyConfigWebhook();
  const shouldPush = (config.alerts?.pushWeCom || args.includes('--push')) &&
    !args.includes('--no-push') &&
    webhook;

  console.log(`Sibyl 即时预警检查完成，候选 ${alerts.length} 个`);
  let sentCount = 0;
  for (const alert of alerts) {
    const message = buildMessage(alert, snapshot.capturedAt);
    console.log('\n' + message + '\n');

    if (!shouldPush) continue;

    state.reported[alert.key] = {
      platform: alert.signal.platform,
      title: alert.signal.title,
      reportedAt: new Date().toISOString(),
      capturedAt: snapshot.capturedAt,
      triggerType: alert.triggerType
    };
    saveState(state);

    const sent = await sendWeComMessage(webhook, message);
    if (sent) {
      sentCount++;
    } else {
      delete state.reported[alert.key];
      saveState(state);
      console.warn(`⚠️ 即时预警发送失败，已撤销去重记录: ${alert.signal.title}`);
    }
  }

  console.log(`✅ Sibyl 即时预警完成，推送 ${sentCount}/${alerts.length} 个`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Sibyl 即时预警失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  selectAlerts
};
