// Topic settings: which topics to keep, their keywords, priority, hints, icons and noise rules.
// They come from config.topics (an object, or the name of a preset in sibyl/presets/).
// Without config.topics the default preset is used.

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.resolve(__dirname, '..', '..', 'presets');
const DEFAULT_PRESET = 'zh-v1.3.20';

let defaultSettings = null;

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

  const categories = (raw.categories || []).map(category => {
    const keywords = [
      ...(category.groups || []).flatMap(name => keywordGroups[name] || []),
      ...(category.keywords || [])
    ];
    return {
      name: category.name,
      icon: category.icon || null,
      groups: category.groups || [],
      keywords,
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

function defaultTopicSettings() {
  if (!defaultSettings) defaultSettings = loadPreset(DEFAULT_PRESET);
  return defaultSettings;
}

function loadTopicSettings(config = {}, configFile = null) {
  const topics = config.topics;
  if (!topics) return defaultTopicSettings();
  if (typeof topics === 'string') return loadPreset(topics);
  const baseDir = configFile ? path.dirname(configFile) : process.cwd();
  return compileTopicSettings(topics, baseDir);
}

module.exports = {
  DEFAULT_PRESET,
  compileTopicSettings,
  defaultTopicSettings,
  loadPreset,
  loadTopicSettings
};
