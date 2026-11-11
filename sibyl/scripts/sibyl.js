#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { defaultSeedPlatforms, sourceFetchers } = require('./lib/source-registry');
const { loadTopicSettings } = require('./lib/topic-settings');
const { configureLocale, text } = require('./lib/locale');
const { reportTarget, sendInParts } = require('./lib/webhook');
const { clusterSignals, buildNextState } = require('./lib/clusterer');
const { generateReport, selectReportClusters, hasBroadcastSeed } = require('./lib/report-generator');
const { classifySignal } = require('./lib/category-classifier');
const {
  applySemanticEventMerge,
  selectPreSummaryCandidates
} = require('./lib/event-threader');
const { applyEventRelevanceFilter } = require('./lib/event-relevance');
const { applyEventSummaries } = require('./lib/event-summary');
const { normalizeForCompare } = require('./lib/signals');
const {
  loadLatestSnapshot,
  loadRecentSnapshots,
  snapshotToSignals
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  platforms: {
    weibo: { enabled: true, maxItems: 50 },
    douyin: { enabled: true, maxItems: 50 },
    tieba: { enabled: true, maxItems: 50 },
    hupu: {
      enabled: true,
      maxItems: 80,
      boards: [
        { board: '步行街', url: 'https://bbs.hupu.com/all-gambia', maxItems: 25 },
        { board: '英雄联盟', url: 'https://bbs.hupu.com/lol', maxItems: 25 },
        { board: 'NBA', url: 'https://bbs.hupu.com/nba', maxItems: 25 },
        { board: '国际足球', url: 'https://bbs.hupu.com/soccer', maxItems: 25 }
      ]
    }
  },
  filters: {
    allowedCategories: ['游戏', '电竞', '体育', 'AI'],
    minTitleLength: 4
  },
  cluster: {
    similarityThreshold: 0.42
  },
  eventMerge: {
    enabled: true,
    candidateLimit: 36,
    preSummaryCandidateLimit: 12,
    preSummaryRetrievalLimit: 4,
    preSummaryTimeBudgetSeconds: 90,
    maxMergeBatchSize: 8,
    minConfidence: 0.8
  },
  eventSummary: {
    enabled: true,
    cacheTtlHours: 6,
    retrievalLimit: 10,
    concurrency: 2,
    timeBudgetSeconds: 180,
    failureCacheTtlMinutes: 30
  },
  eventFilter: {
    enabled: true,
    minConfidence: 0.75
  },
  report: {
    topN: 10,
    minScore: 20,
    requireSeedPlatforms: true,
    seedPlatforms: defaultSeedPlatforms(),
    push: false,
    channel: '',
    webhook: ''
  }
};

function getDefaultDataDir() {
  if (process.env.SIBYL_DATA_DIR) return process.env.SIBYL_DATA_DIR;
  return path.resolve(__dirname, '..', 'data');
}

const DATA_DIR = getDefaultDataDir();
const CONFIG_FILE = process.env.SIBYL_CONFIG || path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals-latest.json');
const CLUSTERS_FILE = path.join(DATA_DIR, 'clusters-latest.json');
const REPORT_FILE = path.join(DATA_DIR, 'report-latest.md');

function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(base?.[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`读取JSON失败 ${file}:`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadConfig() {
  ensureDir(DATA_DIR);
  const fileConfig = readJson(CONFIG_FILE, {});
  return mergeConfig(DEFAULT_CONFIG, fileConfig);
}

function enrichSignals(signals, topicSettings) {
  return signals.map(signal => {
    const classification = classifySignal(signal, topicSettings);
    return {
      ...signal,
      category: classification.category,
      matchedKeywords: classification.matchedKeywords,
      categoryMatches: classification.categoryMatches,
      filteredReason: classification.filteredReason || null
    };
  });
}

function filterSignals(signals, config) {
  const filters = config.filters || {};
  const allowedCategories = filters.allowedCategories || ['游戏', '电竞', '体育', 'AI'];
  return signals.filter(signal => {
    if (!signal.title || signal.title.length < (filters.minTitleLength || 4)) return false;
    return signal.category && allowedCategories.includes(signal.category);
  });
}

async function collectPlatform(name, fetcher, platformConfig) {
  if (!platformConfig || platformConfig.enabled === false) {
    return { name, signals: [], skipped: true };
  }

  try {
    const signals = await fetcher(platformConfig);
    return { name, signals, skipped: false };
  } catch (error) {
    const partialSignals = Array.isArray(error.partialSignals) ? error.partialSignals : [];
    return {
      name,
      signals: partialSignals,
      skipped: false,
      error: error.message
    };
  }
}

function compactSignal(signal) {
  const { raw, tokens, ...rest } = signal;
  return rest;
}

function compactCluster(cluster, reportConfig = {}) {
  return {
    topicId: cluster.topicId,
    title: cluster.mainSignal.title,
    canonicalTitle: cluster.canonicalTitle || cluster.mainSignal.title,
    aliases: cluster.aliases || [],
    eventMerge: cluster.eventMerge || null,
    eventSummary: cluster.eventSummary || null,
    eventSummarySource: cluster.eventSummarySource || null,
    relevance: cluster.relevance || null,
    broadcastFiltered: Boolean(cluster.broadcastFiltered),
    broadcastFilterReason: cluster.broadcastFilterReason || null,
    status: cluster.status,
    statusLabel: cluster.statusLabel,
    score: cluster.score,
    previousScore: cluster.previousScore,
    growthRate: cluster.growthRate,
    hourlyTrend: cluster.hourlyTrend || null,
    category: cluster.category,
    hasBroadcastSeed: hasBroadcastSeed(cluster, reportConfig),
    broadcastReasons: cluster.broadcastReasons || [],
    platformCount: cluster.platformCount,
    platformSummary: cluster.platformSummary,
    totalHeat: cluster.totalHeat,
    bestRank: cluster.bestRank,
    keywords: cluster.keywords,
    entityTokens: cluster.entityTokens,
    eventConcepts: cluster.eventConcepts,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    signals: cluster.signals.map(compactSignal)
  };
}

function snapshotPlatforms(snapshot) {
  return snapshot?.platforms?.length
    ? snapshot.platforms
    : [...new Set((snapshot?.records || []).map(record => record.platform))];
}

function snapshotErrors(snapshot) {
  return (snapshot?.errors || []).map(error => ({
    name: error.platform || 'unknown',
    error: error.message || String(error)
  }));
}

function recordKey(record) {
  return `${record.platform}:${record.normalizedTopic || normalizeForCompare(record.topic || record.title || '')}`;
}

function signalKey(signal) {
  return `${signal.platform}:${signal.normalizedTitle || normalizeForCompare(signal.title || '')}`;
}

function attachSnapshotTrends(clusters, snapshots) {
  if (!snapshots?.length) return clusters;
  const records = snapshots.flatMap(snapshot => snapshot.records || []);

  clusters.forEach(cluster => {
    const keys = new Set([
      ...(cluster.signals || []).map(signalKey),
      ...(cluster.previousSignalKeys || [])
    ]);
    const samples = records
      .filter(record => keys.has(recordKey(record)))
      .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));

    if (!samples.length) return;

    const mainKey = signalKey(cluster.mainSignal);
    const mainSamples = samples.filter(record => recordKey(record) === mainKey);
    const trendSamples = mainSamples.length ? mainSamples : samples;
    const peak = trendSamples.reduce((best, item) => {
      if (!best) return item;
      return (item.heat || 0) > (best.heat || 0) ? item : best;
    }, null);
    const latest = trendSamples[trendSamples.length - 1];
    const currentHeat = cluster.mainSignal?.heat || latest?.heat || 0;
    const peakHeat = peak?.heat || 0;
    const dropFromPeak = peakHeat > 0 && currentHeat < peakHeat
      ? Number(((peakHeat - currentHeat) / peakHeat).toFixed(2))
      : 0;

    cluster.hourlyTrend = {
      sampleCount: trendSamples.length,
      currentHeat,
      currentRank: cluster.mainSignal?.rank || latest?.rank || null,
      peakHeat,
      peakRank: peak?.rank || null,
      peakAt: peak?.capturedAt || null,
      peakPlatform: peak?.platform || cluster.mainSignal?.platform,
      peakPlatformLabel: peak?.platformLabel || cluster.mainSignal?.platformLabel,
      dropFromPeak
    };
  });

  return clusters;
}

async function maybePushReport(report, config, args) {
  const reportConfig = config.report || {};
  const { webhook, channel } = reportTarget(config);
  // "pushWeCom" is the v1.3.20 name of the switch and still works.
  const pushEnabled = reportConfig.push || reportConfig.pushWeCom;
  const shouldPush = (pushEnabled || args.includes('--push')) && !args.includes('--no-push') && webhook;
  if (!shouldPush) return false;

  return sendInParts(webhook, report, { channel, title: text().report.pushTitle });
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  configureLocale(config);
  const previousState = readJson(STATE_FILE, {});
  const reportConfig = config.report || {};
  const seedPlatforms = reportConfig.seedPlatforms || defaultSeedPlatforms();
  const topicSettings = loadTopicSettings(config, CONFIG_FILE);

  const platformFetchers = sourceFetchers(config.platforms);

  let source = 'live';
  let errors = [];
  let platformNames = [];
  let rawSignals = [];
  let recentSnapshots = [];
  const snapshotMaxAge = config.snapshot?.maxAgeMinutes || 20;
  const shouldUseSnapshot = !args.includes('--live') && !args.includes('--fetch');
  const latestSnapshot = shouldUseSnapshot ? loadLatestSnapshot({ maxAgeMinutes: snapshotMaxAge }) : null;

  if (latestSnapshot) {
    source = 'snapshot';
    rawSignals = snapshotToSignals(latestSnapshot);
    platformNames = snapshotPlatforms(latestSnapshot);
    errors = snapshotErrors(latestSnapshot);
    recentSnapshots = loadRecentSnapshots({ minutes: config.snapshot?.trendWindowMinutes || 70 });
    console.log(`使用 Sibyl 最新快照生成播报: ${latestSnapshot.capturedAt}`);
  } else {
    console.log('开始采集多平台热点信号...');
    const results = await Promise.all(platformFetchers.map(([name, fetcher, platformConfig]) =>
      collectPlatform(name, fetcher, platformConfig)
    ));

    errors = results.filter(result => result.error);
    rawSignals = results.flatMap(result => result.signals);
    platformNames = results.filter(result => !result.skipped).map(result => result.name);
  }

  const signals = filterSignals(enrichSignals(rawSignals, topicSettings), config);
  let clusters = clusterSignals(signals, previousState, config.cluster || {});
  const eventMergeEnabled = !args.includes('--no-ai') &&
    !args.includes('--no-event-merge') &&
    config.eventMerge?.enabled !== false;
  const preSummaryConfig = {
    ...config,
    eventSummary: {
      ...(config.eventSummary || {}),
      retrievalLimit: config.eventMerge?.preSummaryRetrievalLimit ?? 4,
      timeBudgetSeconds: config.eventMerge?.preSummaryTimeBudgetSeconds ?? 90
    }
  };
  if (eventMergeEnabled && !args.includes('--no-summary') && config.eventSummary?.enabled !== false) {
    const mergeCandidates = selectPreSummaryCandidates(clusters, {
      ...(config.eventMerge || {}),
      seedPlatforms
    });
    await applyEventSummaries(mergeCandidates, preSummaryConfig);
  }
  clusters = await applySemanticEventMerge(clusters, previousState, {
    ...(config.eventMerge || {}),
    enabled: eventMergeEnabled,
    seedPlatforms,
    ai: config.ai
  });
  if (eventMergeEnabled && !args.includes('--no-summary') && config.eventSummary?.enabled !== false) {
    const relatedCandidates = selectPreSummaryCandidates(clusters, {
      ...(config.eventMerge || {}),
      seedPlatforms
    });
    const reportCandidates = selectReportClusters(clusters, {
      ...reportConfig,
      topN: Math.max(Number(reportConfig.topN) || 10, 10)
    });
    const convergenceCandidates = [...new Map(
      [...relatedCandidates, ...reportCandidates].map(cluster => [cluster.topicId, cluster])
    ).values()];
    await applyEventSummaries(convergenceCandidates, preSummaryConfig);
    clusters = await applySemanticEventMerge(clusters, previousState, {
      ...(config.eventMerge || {}),
      enabled: true,
      seedPlatforms,
      ai: config.ai
    });
  }
  clusters = await applyEventRelevanceFilter(clusters, {
    ...(config.eventFilter || {}),
    useAI: !args.includes('--no-ai'),
    ai: config.ai
  });
  attachSnapshotTrends(clusters, recentSnapshots);
  const selectedForSummary = selectReportClusters(clusters, reportConfig);
  if (!args.includes('--no-summary')) {
    await applyEventSummaries(selectedForSummary, config);
  }
  const generatedAt = new Date().toISOString();
  const report = generateReport(clusters, {
    generatedAt,
    platforms: platformNames,
    rawSignalCount: rawSignals.length,
    signalCount: signals.length,
    source,
    topicSettings
  }, reportConfig);

  ensureDir(DATA_DIR);
  writeJson(SIGNALS_FILE, signals.map(compactSignal));
  writeJson(CLUSTERS_FILE, clusters.map(cluster => compactCluster(cluster, reportConfig)));
  fs.writeFileSync(REPORT_FILE, report);
  writeJson(STATE_FILE, buildNextState(clusters));

  const pushed = await maybePushReport(report, config, args);
  if (args.includes('--print')) {
    console.log('\n' + report);
  }

  console.log('✅ Sibyl 生成热点综合播报完成');
  console.log(`   原始信号: ${rawSignals.length} 条`);
  console.log(`   入池信号: ${signals.length} 条`);
  console.log(`   热点事件: ${clusters.length} 个`);
  console.log(`   数据来源: ${source === 'snapshot' ? 'Sibyl快照' : '现场采集'}`);
  console.log(`   报告文件: ${REPORT_FILE}`);
  console.log(`   推送: ${pushed ? '已发送' : '未发送'}`);
  errors.forEach(error => console.warn(`⚠️ ${error.name} 采集异常: ${error.error}`));
}

main().catch(error => {
  console.error('❌ Sibyl 执行失败:', error.message);
  process.exit(1);
});
