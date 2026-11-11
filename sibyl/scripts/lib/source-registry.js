// Source registry. Each adapter declares its own metadata in `module.exports.source`:
//   id, label, access (how it is read), weight, sourceTypeWeights, sourceTypeBoosts, displayOrder,
//   defaultRole ('seed' = main source; 'community' = a source the user follows, listed under
//   "From sources you follow"; 'support' = adds weight to events seen on a main source),
//   heatUnit ("views"), heatReference (the heat that earns the full 36 heat points; without it
//   the v1.3.20 scale applies), showBoard (show the list name next to the label),
//   alertSourceTypes (which lists may raise instant alerts; default all),
//   fetch(config), an optional link(cluster, helpers) for the briefing and an optional
//   fallbackItemLink(title) for instant alerts on items that have no URL.
// Adapters are loaded lazily so that lib/signals.js can ask for labels without a require cycle.

const ADAPTER_LOADERS = {
  weibo: () => require('../adapters/weibo-adapter'),
  douyin: () => require('../adapters/douyin-adapter'),
  tieba: () => require('../adapters/tieba-adapter'),
  hupu: () => require('../adapters/hupu-adapter'),
  'google-trends': () => require('../adapters/google-trends-adapter'),
  'tiktok-creative-center': () => require('../adapters/tiktok-creative-center-adapter'),
  'x-trends': () => require('../adapters/x-trends-adapter'),
  'youtube-search': () => require('../adapters/youtube-search-adapter'),
  wikipedia: () => require('../adapters/wikipedia-adapter'),
  'youtube-channels': () => require('../adapters/youtube-channels-adapter'),
  rss: () => require('../adapters/rss-adapter')
};

const SOURCE_ORDER = Object.keys(ADAPTER_LOADERS);
const DEFAULT_WEIGHT = 0.7;
const DEFAULT_SOURCE_TYPE_WEIGHT = 0.8;
const DEFAULT_DISPLAY_ORDER = 9;

const loaded = new Map();

function getSource(id) {
  if (!ADAPTER_LOADERS[id]) return null;
  if (!loaded.has(id)) {
    const source = ADAPTER_LOADERS[id]().source;
    if (!source || source.id !== id) {
      throw new Error(`Adapter "${id}" does not export a matching source declaration`);
    }
    loaded.set(id, source);
  }
  return loaded.get(id);
}

function allSources() {
  return SOURCE_ORDER.map(getSource);
}

function sourceLabel(id) {
  return getSource(id)?.label || id;
}

function sourceWeight(id) {
  return getSource(id)?.weight || DEFAULT_WEIGHT;
}

function sourceTypeWeight(sourceType) {
  for (const source of allSources()) {
    const weight = source.sourceTypeWeights?.[sourceType];
    if (weight) return weight;
  }
  return DEFAULT_SOURCE_TYPE_WEIGHT;
}

function sourceTypeBoost(sourceType) {
  for (const source of allSources()) {
    const boost = source.sourceTypeBoosts?.[sourceType];
    if (boost) return boost;
  }
  return 0;
}

function displayOrder(id) {
  return getSource(id)?.displayOrder ?? DEFAULT_DISPLAY_ORDER;
}

// The heat that earns the full 36 heat points, per list type when the adapter sets one.
function sourceHeatReference(id, sourceType = null) {
  const source = getSource(id);
  return (sourceType && source?.heatReferences?.[sourceType]) || source?.heatReference || null;
}

// Main sources by default. With the platforms config, only the ones switched on.
function defaultSeedPlatforms(platformsConfig = null) {
  return allSources()
    .filter(source => source.defaultRole === 'seed')
    .filter(source => !platformsConfig ||
      (platformsConfig[source.id] && platformsConfig[source.id].enabled !== false))
    .map(source => source.id);
}

// The default platforms config: each source on or off (defaultEnabled) with its default
// settings. The v1.3.20 sources are off; the rewrite check switches them on in its config.
function defaultPlatformsConfig() {
  return Object.fromEntries(allSources().map(source => [
    source.id,
    { enabled: Boolean(source.defaultEnabled), ...(source.defaultConfig || {}) }
  ]));
}

// True for lists the agent reads once a day (pages.json): no change within an hour to report.
function isDailyList(id, sourceType) {
  return Boolean(getSource(id)?.dailySourceTypes?.includes(sourceType));
}

// Which of a source's lists may raise instant alerts (null = all of them).
function alertSourceTypes(id) {
  return getSource(id)?.alertSourceTypes || null;
}

function isCommunitySource(id) {
  return getSource(id)?.defaultRole === 'community';
}

function linkSources() {
  return allSources().filter(source => typeof source.link === 'function');
}

// [id, fetch, platformConfig] in registry order, as the collectors expect.
function sourceFetchers(platformsConfig = {}, onlyIds = null) {
  return allSources()
    .filter(source => !onlyIds || onlyIds.has(source.id))
    .map(source => [source.id, source.fetch, platformsConfig[source.id]]);
}

module.exports = {
  SOURCE_ORDER,
  alertSourceTypes,
  allSources,
  defaultPlatformsConfig,
  defaultSeedPlatforms,
  displayOrder,
  getSource,
  isCommunitySource,
  isDailyList,
  linkSources,
  sourceFetchers,
  sourceHeatReference,
  sourceLabel,
  sourceTypeBoost,
  sourceTypeWeight,
  sourceWeight
};
