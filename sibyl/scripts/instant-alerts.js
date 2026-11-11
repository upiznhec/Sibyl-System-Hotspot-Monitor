#!/usr/bin/env node

const path = require('path');

const { collectSnapshot } = require('./collect-snapshot');
const {
  buildDouyinHotListEvidence,
  retrieveDouyinTopicEvidence
} = require('./lib/douyin-topic');
const { classifySignal } = require('./lib/category-classifier');
const { displayHeat, normalizeForCompare } = require('./lib/signals');
const {
  configureLocale,
  isNoSummary,
  localClock,
  localDateKey,
  text,
  zoneName
} = require('./lib/locale');
const { callAIModel, summarizeContent } = require('../../elixir-summarizer/scripts/elixir-summarizer');
const { resolveModelConfig } = require('./lib/model-config');
const {
  alertSourceTypes,
  defaultPlatformsConfig,
  defaultSeedPlatforms,
  getSource
} = require('./lib/source-registry');
const { loadTopicSettings } = require('./lib/topic-settings');
const { evidenceItems, evidenceText } = require('./lib/news-evidence');
const { alertTarget, sendMessage } = require('./lib/webhook');
const { saveAlert } = require('./lib/briefing-archive');
const {
  getDataDir,
  loadLatestSnapshot,
  mergeConfig,
  readJson,
  snapshotToSignals,
  writeJsonAtomic
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  // filters.allowedCategories: by default every topic in the topic settings.
  snapshot: {
    maxAgeMinutes: 20
  },
  alerts: {
    enabled: true,
    push: false,
    channel: '',
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
    aiSearchSummary: {
      enabled: false,
      maxChars: 110
    },
    // Thresholds per main source: an item alerts when its rank is within rankMax or its heat
    // reaches hotMin. The Google Trends and X values are first guesses, to be set in calibration.
    platforms: {
      'google-trends': {
        enabled: true,
        rankMax: 3,
        hotMin: 20000
      },
      'x-trends': {
        enabled: true,
        rankMax: 5,
        hotMin: 50000
      },
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

// Alerts come from the main sources: as set in report.seedPlatforms, or those switched on.
function parsePlatforms(args, config = {}) {
  const platformArg = args.find(arg => arg.startsWith('--platform='));
  const seeds = config.report?.seedPlatforms;
  if (!platformArg) {
    return Array.isArray(seeds) && seeds.length
      ? seeds
      : defaultSeedPlatforms(config.platforms || defaultPlatformsConfig());
  }
  return platformArg.replace('--platform=', '').split(',').map(item => item.trim()).filter(Boolean);
}

function dedupeKey(platform, title, dateKey) {
  return `${dateKey}:${platform}:${normalizeForCompare(title) || title}`;
}

function triggerType(signal, thresholds) {
  const hotTriggered = Number(signal.heat || 0) >= thresholds.hotMin;
  const rankTriggered = Number(signal.rank || 999) <= thresholds.rankMax;
  const rules = text().alert.rules;
  if (hotTriggered && rankTriggered) return rules.both;
  if (hotTriggered) return rules.heat;
  if (rankTriggered) return rules.rank;
  return '';
}

function platformLabel(signal) {
  return getSource(signal.platform)?.label || signal.platformLabel || signal.platform;
}

function detailLink(signal) {
  if (signal.url) return signal.url;
  // Sources whose items have no URL can build a search link from the title.
  return getSource(signal.platform)?.fallbackItemLink?.(signal.title) || '';
}

function normalizeSummary(summary) {
  const text = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!text || /^\[商业广告\]/.test(text)) return '';
  if (isNoSummary(text)) return '';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function buildAISearchSummaryPrompt(signal, options = {}) {
  return AI_SEARCH_SUMMARY_PROMPT
    .replace('{topic}', signal.title || '未知话题')
    .replace('{platform}', platformLabel(signal) || '未知平台')
    .replace('{maxChars}', String(options.maxChars || 110));
}

async function generateAISearchSummary(signal, context) {
  const options = context.aiSearchSummary || {};
  if (!options.enabled) return '';

  const modelConfig = context.modelConfig;
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

  if (!context.enableSummaries) return { summary: text().noSummary };

  if (signal.platform === 'douyin') {
    const douyinOptions = context.config.alerts?.douyinTopic || {};
    let douyinResult = douyinOptions.enabled === false
      ? { success: false, failureReason: 'douyin_topic_disabled' }
      : buildDouyinHotListEvidence(signal, context.snapshotSignals, douyinOptions);
    if (!douyinResult.success && douyinOptions.directPageEnabled === true) {
      douyinResult = await retrieveDouyinTopicEvidence(signal, douyinOptions);
    }
    if (douyinResult.success) {
      const elixirResult = await summarizeContent(douyinResult.evidenceText, signal.title, context.modelConfig);
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

  // News links saved with the item (Google Trends gives up to 3 per search).
  const news = evidenceItems([signal]);
  if (news.length) {
    const elixirResult = await summarizeContent(evidenceText(news), signal.title, context.modelConfig);
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
        source: 'news-links-elixir',
        sources: news.map(item => ({ title: item.title, url: item.url, source: item.source || '' })),
        updatedAt: new Date().toISOString()
      };
      return { summary };
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

  return { summary: text().noSummary };
}

async function enrichAlertsWithSummaries(alerts, config, args, snapshotSignals = []) {
  const context = {
    enableSummaries: config.alerts?.summaries !== false && !args.includes('--no-summary'),
    aiSearchSummary: {
      ...(config.alerts?.aiSearchSummary || {}),
      enabled: config.alerts?.aiSearchSummary?.enabled === true &&
        !args.includes('--no-ai-search-summary')
    },
    config,
    modelConfig: resolveModelConfig(config),
    snapshotSignals,
    summaryCache: loadSummaryCache()
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
      summary: result.summary || text().noSummary
    });
  }

  saveSummaryCache(context.summaryCache);
  return enriched;
}

function buildMessage(alert, capturedAt) {
  const signal = alert.signal;
  const wording = text().alert;
  const link = detailLink(signal);
  const lines = [
    wording.heading(platformLabel(signal)),
    '━━━━━━━━━━━━━━',
    signal.title,
    wording.rankHeat(signal.rank || '-', displayHeat(signal)),
    wording.summary(alert.summary || text().noSummary),
    link ? `[${wording.viewDetails}](${link})` : '',
    '━━━━━━━━━━━━━━',
    wording.trigger(alert.triggerType),
    wording.time(localClock(capturedAt), zoneName(capturedAt))
  ].filter(Boolean);
  return lines.join('\n');
}

function selectAlerts(snapshot, config, state, platforms, topicSettings = loadTopicSettings(config)) {
  const allowedCategories = new Set(config.filters?.allowedCategories || topicSettings.categoryNames);
  const platformSet = new Set(platforms);
  const dateKey = localDateKey(snapshot.capturedAt);
  const alerts = [];

  for (const signal of snapshotToSignals(snapshot)) {
    if (!platformSet.has(signal.platform)) continue;
    // Lists read once a day by the agent (pages.json) do not raise instant alerts.
    const alertTypes = alertSourceTypes(signal.platform);
    if (alertTypes && !alertTypes.includes(signal.sourceType)) continue;
    const platformConfig = config.alerts?.platforms?.[signal.platform];
    if (!platformConfig || platformConfig.enabled === false) continue;

    const currentTriggerType = triggerType(signal, platformConfig);
    if (!currentTriggerType) continue;

    const classification = classifySignal(signal, topicSettings);
    if (!classification.category || !allowedCategories.has(classification.category)) continue;

    const key = dedupeKey(signal.platform, signal.title, dateKey);
    if (state.reported[key]) {
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
  configureLocale(config);
  if (config.alerts?.enabled === false) {
    console.log('Sibyl 即时预警已在配置中关闭');
    return;
  }
  const platforms = parsePlatforms(args, config);
  const configFile = process.env.SIBYL_CONFIG || path.join(getDataDir(), 'config.json');
  const topicSettings = loadTopicSettings(config, configFile);
  const snapshot = await loadSnapshotForAlerts(config, args);

  if (!snapshot) {
    throw new Error('没有可用的Sibyl快照，请先运行 collect-snapshot.js');
  }

  const state = loadState();
  const selectedAlerts = selectAlerts(snapshot, config, state, platforms, topicSettings);
  const alerts = await enrichAlertsWithSummaries(
    selectedAlerts,
    config,
    args,
    snapshotToSignals(snapshot)
  );
  const { webhook, channel } = alertTarget(config);
  // "pushWeCom" is the v1.3.20 name of the switch and still works.
  const pushEnabled = config.alerts?.push || config.alerts?.pushWeCom;
  const dryRun = args.includes('--no-push');
  const shouldPush = (pushEnabled || args.includes('--push')) && !dryRun && webhook;
  // No push target, or push switched off: alerts go to alerts/<date>.md for the agent to show.
  const saveToFile = !dryRun && !shouldPush;
  const archiveOptions = { dataDir: getDataDir(), capturedAt: snapshot.capturedAt, keepDays: config.archive?.keepDays };
  let savedCount = 0;

  console.log(`Sibyl 即时预警检查完成，候选 ${alerts.length} 个`);
  let sentCount = 0;
  for (const alert of alerts) {
    const message = buildMessage(alert, snapshot.capturedAt);
    console.log('\n' + message + '\n');

    if (saveToFile) {
      state.reported[alert.key] = {
        platform: alert.signal.platform,
        title: alert.signal.title,
        reportedAt: new Date().toISOString(),
        capturedAt: snapshot.capturedAt,
        triggerType: alert.triggerType,
        savedToFile: true
      };
      saveState(state);
      saveAlert(message, archiveOptions);
      savedCount++;
      continue;
    }
    if (!shouldPush) continue;

    state.reported[alert.key] = {
      platform: alert.signal.platform,
      title: alert.signal.title,
      reportedAt: new Date().toISOString(),
      capturedAt: snapshot.capturedAt,
      triggerType: alert.triggerType
    };
    saveState(state);

    const sent = await sendMessage(webhook, message, { channel });
    if (sent) {
      sentCount++;
      saveAlert(message, archiveOptions);
    } else {
      delete state.reported[alert.key];
      saveState(state);
      console.warn(`⚠️ 即时预警发送失败，已撤销去重记录: ${alert.signal.title}`);
    }
  }

  console.log(`✅ Sibyl 即时预警完成，推送 ${sentCount}/${alerts.length} 个`);
  if (saveToFile) console.log(`   未配置推送，已存为文件 ${savedCount} 个（alerts/，保留 7 天）`);
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
