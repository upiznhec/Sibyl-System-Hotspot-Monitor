const { displayHeat, formatSignalBrief } = require('./signals');
const { localClock, localDateTime, text, zoneName } = require('./locale');
const {
  defaultSeedPlatforms,
  displayOrder,
  isCommunitySource,
  linkSources,
  sourceLabel
} = require('./source-registry');
const { defaultTopicSettings } = require('./topic-settings');

const STATUS_ICON = {
  new: '🆕',
  rising: '🔥',
  holding: '⏳',
  steady: '👀',
  cooling: '⬇️'
};

// Date and time in the configured time zone (lib/locale.js).
function formatTime(date = new Date()) {
  return localDateTime(date);
}

function formatClock(date = new Date()) {
  return localClock(date);
}

function formatGrowth(cluster) {
  const growth = text().growth;
  if (cluster.growthRate === null || cluster.growthRate === undefined) return growth.first;
  const percent = Math.round(cluster.growthRate * 100);
  if (percent > 0) return growth.up(percent);
  if (percent < 0) return growth.down(Math.abs(percent));
  return growth.flat;
}

function pickCategory(cluster) {
  return cluster.category || text().uncategorized;
}

function clusterText(cluster) {
  return [
    cluster.mainSignal?.title,
    ...(cluster.keywords || []),
    ...(cluster.signals || []).flatMap(signal => [signal.title, signal.board])
  ].filter(Boolean).join(' ');
}

function visualCategory(cluster, settings) {
  const category = pickCategory(cluster);
  const topic = settings.categories.find(item => item.name === category);
  if (!topic || topic.subcategories.length === 0) return category;

  const text = clusterText(cluster);
  const sub = topic.subcategories.find(item => item.pattern.test(text));
  return sub ? sub.name : category;
}

function categoryIcon(cluster, settings) {
  return settings.icons[visualCategory(cluster, settings)] || settings.icons[cluster.category] || '▫️';
}

function platformNamesForCluster(cluster, seedSet) {
  const names = (cluster.signals || [])
    .filter(signal => seedSet.has(signal.platform))
    .map(signal => signal.platformLabel)
    .filter(Boolean);
  const join = text().nameJoin;
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 0) return uniqueNames.join(join);
  return [...new Set((cluster.signals || []).map(signal => signal.platformLabel).filter(Boolean))].join(join) ||
    text().unknownSource;
}

function basisStatusText(cluster) {
  const wording = text();
  return wording.basisStatus[cluster.status] || wording.basisStatusFallback(cluster.statusLabel);
}

function scoreToPercent(rawScore = 0) {
  const score = Number(rawScore) || 0;
  const anchors = [
    [0, 0],
    [20, 30],
    [50, 50],
    [80, 65],
    [120, 75],
    [180, 85],
    [250, 92],
    [350, 97],
    [500, 100]
  ];

  for (let i = 1; i < anchors.length; i++) {
    const [prevRaw, prevDisplay] = anchors[i - 1];
    const [nextRaw, nextDisplay] = anchors[i];
    if (score <= nextRaw) {
      const ratio = (score - prevRaw) / (nextRaw - prevRaw);
      return Math.round(prevDisplay + ratio * (nextDisplay - prevDisplay));
    }
  }

  return 100;
}

function scoreLevel(displayScore) {
  const levels = text().levels;
  if (displayScore >= 85) return levels.strong;
  if (displayScore >= 60) return levels.follow;
  return levels.watch;
}

function formatDisplayScore(rawScore) {
  const displayScore = scoreToPercent(rawScore);
  return text().displayScore(displayScore, scoreLevel(displayScore));
}

function signalDisplayOrder(signal) {
  return [
    displayOrder(signal.platform),
    signal.rank || 999
  ];
}

function compareSignalsForDisplay(a, b) {
  const left = signalDisplayOrder(a);
  const right = signalDisplayOrder(b);
  if (left[0] !== right[0]) return left[0] - right[0];
  return left[1] - right[1];
}

function buildHeatLine(cluster) {
  const sortedSignals = (cluster.signals || []).slice().sort(compareSignalsForDisplay);
  if (sortedSignals.length === 0) return (cluster.platformSummary || []).slice(0, 3).join(text().pipe);

  const strongestByPlatform = [];
  const seenPlatforms = new Set();
  sortedSignals.forEach(signal => {
    if (seenPlatforms.has(signal.platform)) return;
    seenPlatforms.add(signal.platform);
    strongestByPlatform.push(signal);
  });
  return strongestByPlatform.slice(0, 4).map(formatSignalBrief).join(text().heatJoin);
}

function buildTrendSummary(cluster) {
  const wording = text().trend;
  if (cluster.hourlyTrend?.sampleCount >= 2) {
    const trend = cluster.hourlyTrend;
    const parts = [];
    if (cluster.status !== 'new') parts.push(basisStatusText(cluster));
    if (trend.dropFromPeak > 0) {
      parts.push(wording.belowPeak(Math.round(trend.dropFromPeak * 100)));
    } else {
      parts.push(wording.atPeak);
    }
    if (trend.peakHeat) {
      parts.push(wording.peak({
        source: trend.peakPlatformLabel || wording.mainSource,
        rank: trend.peakRank,
        heat: displayHeat({
          platform: trend.peakPlatform,
          sourceType: trend.peakPlatform === cluster.mainSignal?.platform ? cluster.mainSignal.sourceType : undefined,
          heat: trend.peakHeat,
          heatText: ''
        }),
        time: trend.peakAt ? formatClock(trend.peakAt) : ''
      }));
    }
    return parts.join(wording.join);
  }

  if (cluster.status === 'new') return '';
  return wording.withGrowth(basisStatusText(cluster), formatGrowth(cluster));
}

function buildPerformanceLine(cluster, seedSet) {
  const wording = text().performance;
  const parts = [buildHeatLine(cluster)];
  const platformText = platformNamesForCluster(cluster, seedSet);
  parts.push(cluster.platformCount > 1
    ? wording.multi(cluster.platformCount)
    : wording.single(platformText));
  if ((cluster.aliases || []).length > 1) {
    parts.push(wording.aliases(cluster.aliases.length));
  }
  parts.push(cluster.previousScore ? wording.repeat : wording.first);
  const trend = buildTrendSummary(cluster);
  if (trend) parts.push(trend);
  return `${parts.filter(Boolean).join(wording.join)}${wording.end}`;
}

function bestSignalForPlatform(cluster, platform) {
  return (cluster.signals || []).find(signal => signal.platform === platform);
}

function fallbackTopicTerm(cluster, settings) {
  const keywords = [...new Set(cluster.keywords || [])]
    .filter(keyword => String(keyword).trim().length >= 2)
    .slice(0, 4);
  return keywords.length ? keywords.join(' ') : text().inferTopicTerm(cluster.mainSignal.title, settings.knownTerms);
}

function platformTopicTerm(cluster, platform, settings) {
  const platformSignal = bestSignalForPlatform(cluster, platform);
  return platformSignal?.title || fallbackTopicTerm(cluster, settings);
}

function platformSearchLink(cluster, platform, directLabel, fallbackLabel, urlBuilder, settings) {
  const platformSignal = bestSignalForPlatform(cluster, platform);
  const term = platformTopicTerm(cluster, platform, settings);
  const encoded = encodeURIComponent(term);
  const label = platformSignal ? directLabel : fallbackLabel;
  return `[${label}](${urlBuilder(encoded)})`;
}

// Each source builds its own link, or returns '' to show none; the helpers give it the shared lookup rules.
// Only sources that are switched on add links (v1.3.20's Weibo, Douyin and Hupu links appear on
// every item, so a source that is off must not add them).
function detailLinks(cluster, settings, enabledPlatforms = null) {
  const helpers = {
    bestSignalForPlatform,
    fallbackTopicTerm: item => fallbackTopicTerm(item, settings),
    platformSearchLink: (item, platform, directLabel, fallbackLabel, urlBuilder) =>
      platformSearchLink(item, platform, directLabel, fallbackLabel, urlBuilder, settings)
  };
  return linkSources()
    .filter(source => !enabledPlatforms || enabledPlatforms.has(source.id))
    .map(source => source.link(cluster, helpers))
    .filter(Boolean)
    .join(text().pipe);
}

function seedPlatforms(config = {}) {
  return Array.isArray(config.seedPlatforms) && config.seedPlatforms.length
    ? config.seedPlatforms
    : defaultSeedPlatforms();
}

function seedPlatformText(config = {}) {
  return seedPlatforms(config)
    .map(sourceLabel)
    .join(text().or);
}

function hasBroadcastSeed(cluster, config = {}) {
  const requiredPlatforms = new Set(seedPlatforms(config));
  return (cluster.signals || []).some(signal => requiredPlatforms.has(signal.platform));
}

function eligibleReportClusters(clusters, config = {}) {
  const relevant = clusters.filter(cluster => !cluster.broadcastFiltered);
  if (config.requireSeedPlatforms === false) return relevant;
  return relevant.filter(cluster => hasBroadcastSeed(cluster, config));
}

function communityOnlyClusters(clusters, config = {}) {
  if (config.showCommunityWatchlist === false) return [];
  return clusters
    .filter(cluster => !cluster.broadcastFiltered)
    .filter(cluster => !hasBroadcastSeed(cluster, config))
    .filter(cluster => (cluster.signals || []).some(signal => isCommunitySource(signal.platform)))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.communityWatchlistN || 3);
}

function selectReportClusters(clusters, config = {}) {
  const topN = config.topN || 8;
  const minScore = config.minScore || 0;
  return eligibleReportClusters(clusters, config)
    .filter(cluster => cluster.score >= minScore)
    .slice(0, topN);
}

function renderCluster(cluster, index, context) {
  const icon = STATUS_ICON[cluster.status] || '👀';
  const category = categoryIcon(cluster, context.settings);
  const lines = [];

  lines.push(`### ${index + 1}. ${category} ${icon} ${cluster.canonicalTitle || cluster.mainSignal.title}`);
  lines.push('');
  const wording = text().report;
  lines.push(wording.scoreLine(formatDisplayScore(cluster.score)));
  lines.push('');
  lines.push(wording.signalsLine(buildPerformanceLine(cluster, context.seedSet)));
  lines.push('');
  lines.push(wording.summaryLine(cluster.eventSummary));
  lines.push('');
  lines.push(detailLinks(cluster, context.settings, context.enabledPlatforms));
  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateReport(clusters, meta = {}, config = {}) {
  const topN = config.topN || 8;
  const eligibleClusters = eligibleReportClusters(clusters, config);
  const selected = selectReportClusters(clusters, config);
  const context = {
    settings: meta.topicSettings || defaultTopicSettings(),
    seedSet: new Set(seedPlatforms(config)),
    enabledPlatforms: Array.isArray(meta.enabledPlatforms) ? new Set(meta.enabledPlatforms) : null
  };

  const wording = text().report;
  const generatedAt = meta.generatedAt || new Date();
  const lines = [];
  lines.push(wording.title);
  lines.push('');
  lines.push(wording.generated(formatTime(generatedAt), zoneName(generatedAt)));
  lines.push('');

  if (selected.length === 0) {
    lines.push(wording.noItems(seedPlatformText(config)));
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');

  selected.forEach((cluster, index) => {
    lines.push(renderCluster(cluster, index, context));
  });

  const watchlist = eligibleClusters.slice(topN, topN + 5);
  if (watchlist.length > 0) {
    lines.push(wording.watchlistHeading);
    lines.push('');
    watchlist.forEach(cluster => {
      const heat = cluster.platformSummary.slice(0, 2).join(text().pipe);
      lines.push(wording.watchlistLine(cluster.canonicalTitle || cluster.mainSignal.title, cluster.statusLabel, heat));
    });
    lines.push('');
  }

  const communityWatchlist = communityOnlyClusters(clusters, config);
  if (communityWatchlist.length > 0) {
    lines.push(wording.followedHeading);
    lines.push('');
    communityWatchlist.forEach(cluster => {
      const category = visualCategory(cluster, context.settings);
      const heat = buildHeatLine(cluster);
      lines.push(wording.followedLine(
        category,
        cluster.canonicalTitle || cluster.mainSignal.title,
        formatDisplayScore(cluster.score),
        heat
      ));
    });
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

module.exports = {
  generateReport,
  formatTime,
  selectReportClusters,
  hasBroadcastSeed
};
