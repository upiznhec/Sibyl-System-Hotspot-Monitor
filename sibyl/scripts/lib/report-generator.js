const { formatHeat } = require('./signals');
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

function formatTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const beijing = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().replace('T', ' ').slice(0, 16);
}

function formatClock(date = new Date()) {
  return formatTime(date).slice(11, 16);
}

function formatGrowth(cluster) {
  if (cluster.growthRate === null || cluster.growthRate === undefined) return '首次出现';
  const percent = Math.round(cluster.growthRate * 100);
  if (percent > 0) return `比上轮高 ${percent}%`;
  if (percent < 0) return `比上轮低 ${Math.abs(percent)}%`;
  return '和上轮接近';
}

function pickCategory(cluster) {
  return cluster.category || '未分类';
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
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 0) return uniqueNames.join('、');
  return [...new Set((cluster.signals || []).map(signal => signal.platformLabel).filter(Boolean))].join('、') || '未知';
}

function basisStatusText(cluster) {
  return {
    new: '本轮首次进入候选',
    rising: '当前热度上升中',
    holding: '当前持续在榜',
    steady: '当前热度平稳',
    cooling: '当前热度回落中'
  }[cluster.status] || `当前${cluster.statusLabel || '状态待观察'}`;
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
  if (displayScore >= 85) return '强热点';
  if (displayScore >= 60) return '关注后续';
  return '观察';
}

function formatDisplayScore(rawScore) {
  const displayScore = scoreToPercent(rawScore);
  return `${displayScore}/100（${scoreLevel(displayScore)}）`;
}

function formatSignalBrief(signal) {
  const rank = signal.rank ? `#${signal.rank}` : '未排名';
  const heat = signal.heat ? ` ${formatHeat(signal.heat)}` : '';
  const board = signal.board ? `${signal.platformLabel}/${signal.board}` : signal.platformLabel;
  return `${board}${rank}${heat}`;
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
  if (sortedSignals.length === 0) return (cluster.platformSummary || []).slice(0, 3).join(' ｜ ');

  const strongestByPlatform = [];
  const seenPlatforms = new Set();
  sortedSignals.forEach(signal => {
    if (seenPlatforms.has(signal.platform)) return;
    seenPlatforms.add(signal.platform);
    strongestByPlatform.push(signal);
  });
  return strongestByPlatform.slice(0, 4).map(formatSignalBrief).join('、');
}

function buildTrendSummary(cluster) {
  if (cluster.hourlyTrend?.sampleCount >= 2) {
    const trend = cluster.hourlyTrend;
    const parts = [];
    if (cluster.status !== 'new') parts.push(basisStatusText(cluster));
    if (trend.dropFromPeak > 0) {
      parts.push(`较小时最高点低 ${Math.round(trend.dropFromPeak * 100)}%`);
    } else {
      parts.push('处于小时内高点');
    }
    if (trend.peakHeat) {
      const rank = trend.peakRank ? `#${trend.peakRank} ` : '';
      const platform = trend.peakPlatformLabel || '主平台';
      const time = trend.peakAt ? `（${formatClock(trend.peakAt)}）` : '';
      parts.push(`${platform}小时最高 ${rank}${formatHeat(trend.peakHeat)}${time}`);
    }
    return parts.join('，');
  }

  if (cluster.status === 'new') return '';
  return `${basisStatusText(cluster)}，${formatGrowth(cluster)}`;
}

function buildPerformanceLine(cluster, seedSet) {
  const parts = [buildHeatLine(cluster)];
  const platformText = platformNamesForCluster(cluster, seedSet);
  parts.push(cluster.platformCount > 1
    ? `${cluster.platformCount}个平台共同出现`
    : `${platformText}单平台出现`);
  if ((cluster.aliases || []).length > 1) {
    parts.push(`同一事件覆盖${cluster.aliases.length}个话题词`);
  }
  parts.push(cluster.previousScore ? '连续进入播报' : '首次进入播报');
  const trend = buildTrendSummary(cluster);
  if (trend) parts.push(trend);
  return `${parts.filter(Boolean).join('；')}。`;
}

function bestSignalForPlatform(cluster, platform) {
  return (cluster.signals || []).find(signal => signal.platform === platform);
}

function fallbackTopicTerm(cluster, settings) {
  const keywords = [...new Set(cluster.keywords || [])]
    .filter(keyword => String(keyword).trim().length >= 2)
    .slice(0, 4);
  return keywords.length ? keywords.join(' ') : inferTopicTerm(cluster.mainSignal.title, settings.knownTerms);
}

function includesTerm(text, term) {
  return text.toLowerCase().includes(String(term).toLowerCase());
}

function inferTopicTerm(title = '', knownTerms = []) {
  const text = String(title)
    .replace(/^原创\s*/i, '')
    .replace(/[《》“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const entities = knownTerms.filter(term => includesTerm(text, term));
  if (entities.length) return entities.slice(0, 3).join(' ');

  const segments = text
    .split(/[：:，,。！？?；;｜|\-—\s]+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  const concise = segments.find(segment =>
    segment.length >= 2 &&
    segment.length <= 18 &&
    !/^(原创|如何看待|怎么看|为什么|有没有|大家|他们|这个|那个|也期待)$/.test(segment)
  );

  return concise || text.slice(0, 18);
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

// Each source builds its own link; the helpers give it the shared lookup rules.
function detailLinks(cluster, settings) {
  const helpers = {
    bestSignalForPlatform,
    fallbackTopicTerm: item => fallbackTopicTerm(item, settings),
    platformSearchLink: (item, platform, directLabel, fallbackLabel, urlBuilder) =>
      platformSearchLink(item, platform, directLabel, fallbackLabel, urlBuilder, settings)
  };
  return linkSources()
    .map(source => source.link(cluster, helpers))
    .join(' ｜ ');
}

function seedPlatforms(config = {}) {
  return Array.isArray(config.seedPlatforms) && config.seedPlatforms.length
    ? config.seedPlatforms
    : defaultSeedPlatforms();
}

function seedPlatformText(config = {}) {
  return seedPlatforms(config)
    .map(sourceLabel)
    .join('或');
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
  lines.push(`**综合分：${formatDisplayScore(cluster.score)}**`);
  lines.push('');
  lines.push(`**热度表现：** ${buildPerformanceLine(cluster, context.seedSet)}`);
  lines.push('');
  lines.push(`**事件摘要：** ${cluster.eventSummary || '暂缺可靠摘要。'}`);
  lines.push('');
  lines.push(detailLinks(cluster, context.settings));
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
    seedSet: new Set(seedPlatforms(config))
  };

  const lines = [];
  lines.push('# 热点综合播报');
  lines.push('');
  lines.push(`播报时间：${formatTime(meta.generatedAt || new Date())}`);
  lines.push('');

  if (selected.length === 0) {
    lines.push(`本轮暂无命中${seedPlatformText(config)}热搜且达到入选标准的热点。`);
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');

  selected.forEach((cluster, index) => {
    lines.push(renderCluster(cluster, index, context));
  });

  const watchlist = eligibleClusters.slice(topN, topN + 5);
  if (watchlist.length > 0) {
    lines.push('### 观察列表');
    lines.push('');
    watchlist.forEach(cluster => {
      const heat = cluster.platformSummary.slice(0, 2).join(' ｜ ');
      lines.push(`- ${cluster.canonicalTitle || cluster.mainSignal.title}：${cluster.statusLabel} ｜ ${heat}`);
    });
    lines.push('');
  }

  const communityWatchlist = communityOnlyClusters(clusters, config);
  if (communityWatchlist.length > 0) {
    lines.push('### 社区观察');
    lines.push('');
    communityWatchlist.forEach(cluster => {
      const category = visualCategory(cluster, context.settings);
      const heat = buildHeatLine(cluster);
      lines.push(`- ${category} ｜ ${cluster.canonicalTitle || cluster.mainSignal.title} ｜ 综合分 ${formatDisplayScore(cluster.score)} ｜ ${heat}`);
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
