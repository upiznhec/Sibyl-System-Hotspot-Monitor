// Source registry. Each adapter declares its own metadata in `module.exports.source`:
//   id, label, weight, sourceTypeWeights, sourceTypeBoosts, displayOrder,
//   defaultRole ('seed' = main source, 'community' = supporting source),
//   fetch(config), an optional link(cluster, helpers) for the briefing and an optional
//   fallbackItemLink(title) for instant alerts on items that have no URL.
// Adapters are loaded lazily so that lib/signals.js can ask for labels without a require cycle.

const ADAPTER_LOADERS = {
  weibo: () => require('../adapters/weibo-adapter'),
  douyin: () => require('../adapters/douyin-adapter'),
  tieba: () => require('../adapters/tieba-adapter'),
  hupu: () => require('../adapters/hupu-adapter')
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

function defaultSeedPlatforms() {
  return allSources().filter(source => source.defaultRole === 'seed').map(source => source.id);
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
  allSources,
  defaultSeedPlatforms,
  displayOrder,
  getSource,
  isCommunitySource,
  linkSources,
  sourceFetchers,
  sourceLabel,
  sourceTypeBoost,
  sourceTypeWeight,
  sourceWeight
};
