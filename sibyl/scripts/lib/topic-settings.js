// Topic settings: which topics to keep, their keywords, priority, hints, icons and noise rules.
// They come from config.topics: a list of topics, an object, or the name of a preset in
// sibyl/presets/. Without config.topics the example preset is used.

const fs = require('fs');
const path = require('path');

const { text } = require('./locale');

const PRESETS_DIR = path.resolve(__dirname, '..', '..', 'presets');
const DEFAULT_PRESETS = { en: 'example-beauty' };

const presetCache = new Map();

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toRegExp(entry) {
  return new RegExp(entry.pattern, entry.flags || '');
}

function loadKeywordGroups(keywordsFile) {
  if (!keywordsFile) return {};
  const data = readJsonFile(keywordsFile);
  const groups = {};
  for (const [name, group] of Object.entries(data.categories || {})) {
    groups[name] = group.keywords || [];
  }
  return groups;
}

function compileTopicSettings(raw, baseDir) {
  const keywordsFile = raw.keywordsFile ? path.resolve(baseDir, raw.keywordsFile) : null;
  const keywordGroups = loadKeywordGroups(keywordsFile);

  // "topics" is the format the agent writes: [{ name, icon, keywords }]. "categories" is v1.3.20's.
  const categories = (raw.categories || raw.topics || []).map(category => {
    const keywords = [
      ...(category.groups || []).flatMap(name => keywordGroups[name] || []),
      ...(category.keywords || [])
    ];
    return {
      name: category.name,
      icon: category.icon || null,
      groups: category.groups || [],
      keywords,
      // Words that keep an item of this topic out of the main briefing, e.g. "promo code".
      briefingExclude: Array.isArray(category.briefingExclude) ? category.briefingExclude : [],
      subcategories: (category.subcategories || []).map(sub => ({
        name: sub.name,
        icon: sub.icon || null,
        pattern: toRegExp(sub)
      }))
    };
  });

  const icons = {};
  categories.forEach(category => {
    if (category.icon) icons[category.name] = category.icon;
    category.subcategories.forEach(sub => {
      if (sub.icon) icons[sub.name] = sub.icon;
    });
  });

  const noise = raw.productNoise;
  return {
    name: raw.name || null,
    keywordsFile,
    categories,
    categoryNames: categories.map(category => category.name),
    priority: raw.priority || categories.map(category => category.name),
    boardHints: (raw.boardHints || []).map(hint => ({
      pattern: toRegExp(hint),
      category: hint.category
    })),
    productNoise: noise ? {
      category: noise.category,
      ambiguousWords: new Set((noise.ambiguousWords || []).map(word => String(word).toLowerCase())),
      pattern: toRegExp(noise),
      reason: noise.reason || ''
    } : null,
    icons,
    knownTerms: raw.knownTerms || []
  };
}

function loadPreset(name) {
  const file = path.join(PRESETS_DIR, `${name}.json`);
  return compileTopicSettings(readJsonFile(file), path.dirname(file));
}

function defaultPresetName() {
  return DEFAULT_PRESETS[text().code] || DEFAULT_PRESETS.en;
}

function defaultTopicSettings() {
  const name = defaultPresetName();
  if (!presetCache.has(name)) presetCache.set(name, loadPreset(name));
  return presetCache.get(name);
}

function loadTopicSettings(config = {}, configFile = null) {
  const topics = config.topics;
  if (!topics) return defaultTopicSettings();
  if (typeof topics === 'string') return loadPreset(topics);
  if (Array.isArray(topics)) return compileTopicSettings({ topics }, configFile ? path.dirname(configFile) : process.cwd());
  const baseDir = configFile ? path.dirname(configFile) : process.cwd();
  return compileTopicSettings(topics, baseDir);
}

module.exports = {
  DEFAULT_PRESETS,
  compileTopicSettings,
  defaultPresetName,
  defaultTopicSettings,
  loadPreset,
  loadTopicSettings
};
