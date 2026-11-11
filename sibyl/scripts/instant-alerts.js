#!/usr/bin/env node

const path = require('path');

const { collectSnapshot } = require('./collect-snapshot');
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
    // Optional: a model that can search the web writes summaries for alerts without news links.
    aiSearchSummary: {
      enabled: false,
      maxWords: 50
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
      }
    }
  },
  report: {
    webhook: ''
  }
};

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
  if (!text) return '';
  if (isNoSummary(text)) return '';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

const AI_SEARCH_SUMMARY_PROMPT = `You write short summaries for trend alerts. Search public information about the trending topic below and summarise it.

Rules:
1. Base the summary on information you found by searching. If you cannot search, find nothing, or the information is unclear, reply only: No summary yet
2. Do not guess from the title; do not invent results, quotes, numbers, dates or official conclusions.
3. At most {maxWords} words, in one or two sentences.
4. Say what happened, why people are talking about it, and whether it looks worth following.
5. No reasoning steps, source lists, titles, quotes or Markdown; only the summary.
6. If the topic turns out to be advertising, reply only: No summary yet

Topic: {topic}
Source: {platform}

Reply with the summary only.`;

function buildAISearchSummaryPrompt(signal, options = {}) {
  return AI_SEARCH_SUMMARY_PROMPT
    .replace('{topic}', signal.title || 'unknown topic')
    .replace('{platform}', platformLabel(signal) || 'unknown source')
    .replace('{maxWords}', String(options.maxWords || 50));
}

async function generateAISearchSummary(signal, context) {
  const options = context.aiSearchSummary || {};
  if (!options.enabled) return '';

  const modelConfig = context.modelConfig;
  if (!modelConfig?.apiKey) return '';

  const result = await callAIModel(buildAISearchSummaryPrompt(signal, options), modelConfig, 1);
  if (!result.success) {
    console.log(`⚠️ Search summary failed: ${signal.title} - ${result.error || 'unknown error'}`);
    return '';
  }

  const summary = normalizeSummary(result.content);
  if (!summary) return '';

  // A reply that says the model could not search is not a summary.
  if (/cannot|can't|unable to|no (search )?results|not enough information|as an ai/i.test(summary)) return '';
  const words = summary.split(/\s+/);
  const maxWords = options.maxWords || 50;
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}...` : summary;
}

async function buildAlertSummary(alert, context) {
  const signal = alert.signal;
  const cacheKey = `${signal.platform}:${normalizeForCompare(signal.title) || signal.title}`;
  const cached = normalizeSummary(context.summaryCache[cacheKey]?.summary);
  if (cached) return { summary: cached };

  if (!context.enableSummaries) return { summary: text().noSummary };

  // News links saved with the item (Google Trends gives up to 3 per search).
  const news = evidenceItems([signal]);
  if (news.length) {
    const elixirResult = await summarizeContent(evidenceText(news), signal.title, context.modelConfig);
    if (elixirResult.isCommercial) {
      return {
        filtered: true,
        reason: elixirResult.reason || 'judged to be advertising'
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
      console.log(`🚫 Alert dropped: ${alert.signal.title} - ${result.reason}`);
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
    console.log('Sibyl instant alerts are turned off in the config');
    return;
  }
  const platforms = parsePlatforms(args, config);
  const configFile = process.env.SIBYL_CONFIG || path.join(getDataDir(), 'config.json');
  const topicSettings = loadTopicSettings(config, configFile);
  const snapshot = await loadSnapshotForAlerts(config, args);

  if (!snapshot) {
    throw new Error('No recent snapshot: run collect-snapshot.js first');
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

  console.log(`Sibyl instant alerts checked: ${alerts.length} candidate(s)`);
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
      console.warn(`⚠️ Alert not delivered; it can alert again: ${alert.signal.title}`);
    }
  }

  console.log(`✅ Sibyl instant alerts done: ${sentCount}/${alerts.length} pushed`);
  if (saveToFile) console.log(`   No push set: ${savedCount} saved as files (alerts/, kept 7 days)`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Sibyl instant alerts failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  selectAlerts
};
