const { defaultTopicSettings } = require('./topic-settings');
const { getKeywordWord, keywordMatchesTitle } = require('./keyword-matcher');

function matchKeywords(title, keywords) {
  return keywords
    .filter(keyword => keywordMatchesTitle(title, keyword, { logExclusion: true }))
    .map(getKeywordWord)
    .filter(Boolean);
}

function boardCategory(board = '', settings) {
  for (const hint of settings.boardHints) {
    if (hint.pattern.test(board)) return hint.category;
  }
  return null;
}

function isLikelyProductNoise(title, category, matches, settings) {
  const rule = settings.productNoise;
  if (!rule) return false;
  if (category !== rule.category) return false;
  if (!rule.pattern.test(title)) return false;
  if (matches.length === 0) return false;
  return matches.every(word => rule.ambiguousWords.has(String(word).toLowerCase()));
}

function chooseCategory(categoryMatches, hintedCategory = null, priority = []) {
  const candidates = Object.entries(categoryMatches)
    .filter(([, matches]) => matches.length > 0)
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return priority.indexOf(a[0]) - priority.indexOf(b[0]);
    });

  if (candidates.length > 0) return candidates[0][0];
  return hintedCategory;
}

function classifySignal(signal, settings = defaultTopicSettings()) {
  const title = signal.title || '';
  const categoryMatches = {};

  for (const category of settings.categories) {
    categoryMatches[category.name] = matchKeywords(title, category.keywords);
  }

  const topicHint = settings.categoryNames.includes(signal.topicHint) ? signal.topicHint : null;
  const hintedCategory = boardCategory(signal.board || '', settings) || topicHint;
  const category = chooseCategory(categoryMatches, hintedCategory, settings.priority);
  if (!category) {
    return {
      category: null,
      matchedKeywords: [],
      categoryMatches
    };
  }

  const matchedKeywords = [...new Set([
    ...(categoryMatches[category] || []),
    ...Object.values(categoryMatches).flat()
  ])];

  if (isLikelyProductNoise(title, category, matchedKeywords, settings)) {
    return {
      category: null,
      matchedKeywords,
      categoryMatches,
      filteredReason: settings.productNoise.reason
    };
  }

  return {
    category,
    matchedKeywords,
    categoryMatches
  };
}

function categoryGroups(settings = defaultTopicSettings()) {
  return Object.fromEntries(settings.categories.map(category => [category.name, category.groups]));
}

module.exports = {
  // Read when used, so that it follows the configured language's default topics.
  get CATEGORY_GROUPS() {
    return categoryGroups();
  },
  categoryGroups,
  classifySignal
};
