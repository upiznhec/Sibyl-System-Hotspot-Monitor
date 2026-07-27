let keywordLoader = null;
try {
  keywordLoader = require('../../../weibo-monitor/scripts/keywords-loader');
} catch (e) {
  keywordLoader = null;
}

const CATEGORY_GROUPS = {
  游戏: ['games', 'moba'],
  电竞: [
    'esports_leagues',
    'esports_teams_lpl',
    'esports_teams_lck',
    'esports_teams_kpl',
    'esports_players_lpl',
    'esports_players_kpl'
  ],
  体育: ['sports', 'sports_stars', 'worldcup_national_teams'],
  AI: [
    'ai_general',
    'ai_models_products',
    'ai_coding_agents',
    'ai_generation',
    'ai_infrastructure',
    'ai_robotics',
    'ai_science',
    'ai_safety_governance',
    'ai_key_person'
  ]
};

const CATEGORY_PRIORITY = ['电竞', '体育', 'AI', '游戏'];
const BOARD_CATEGORY_HINTS = [
  { pattern: /英雄联盟|lol|kpl|lpl|电竞|王者荣耀/i, category: '电竞' },
  { pattern: /nba|篮球|足球|国际足球|cba|英超|西甲|体育/i, category: '体育' },
  { pattern: /人工智能|生成式ai|aigc|大模型|智能体|deepseek|openai/i, category: 'AI' },
  { pattern: /游戏|steam|主机|手游/i, category: '游戏' }
];

const AMBIGUOUS_GAME_WORDS = new Set(['荣耀', '王者', '游戏']);
const NON_TARGET_PRODUCT_HINTS = /手机|发布会|新机|汽车|新车|电商|优惠|补贴|销量|售价|门店|发布|上市/i;

function keywordWord(keyword) {
  if (!keywordLoader || !keywordLoader.getKeywordWord) {
    return typeof keyword === 'object' ? keyword.word : keyword;
  }
  return keywordLoader.getKeywordWord(keyword);
}

function matchKeywords(title, keywords) {
  if (!keywordLoader || !keywordLoader.isTargetTopic) return [];
  return keywords
    .filter(keyword => keywordLoader.isTargetTopic(title, [keyword]))
    .map(keywordWord)
    .filter(Boolean);
}

function keywordsForGroup(groupNames) {
  if (!keywordLoader || !keywordLoader.getKeywordsByCategory) return [];
  return groupNames.flatMap(name => keywordLoader.getKeywordsByCategory(name) || []);
}

function boardCategory(board = '') {
  for (const hint of BOARD_CATEGORY_HINTS) {
    if (hint.pattern.test(board)) return hint.category;
  }
  return null;
}

function isLikelyProductNoise(title, category, matches) {
  if (category !== '游戏') return false;
  if (!NON_TARGET_PRODUCT_HINTS.test(title)) return false;
  if (matches.length === 0) return false;
  return matches.every(word => AMBIGUOUS_GAME_WORDS.has(String(word).toLowerCase()));
}

function chooseCategory(categoryMatches, hintedCategory = null) {
  const candidates = Object.entries(categoryMatches)
    .filter(([, matches]) => matches.length > 0)
    .sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]);
    });

  if (candidates.length > 0) return candidates[0][0];
  return hintedCategory;
}

function classifySignal(signal) {
  const title = signal.title || '';
  const categoryMatches = {};

  for (const [category, groupNames] of Object.entries(CATEGORY_GROUPS)) {
    categoryMatches[category] = matchKeywords(title, keywordsForGroup(groupNames));
  }

  const hintedCategory = boardCategory(signal.board || '');
  const category = chooseCategory(categoryMatches, hintedCategory);
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

  if (isLikelyProductNoise(title, category, matchedKeywords)) {
    return {
      category: null,
      matchedKeywords,
      categoryMatches,
      filteredReason: '疑似非目标商业/产品话题'
    };
  }

  return {
    category,
    matchedKeywords,
    categoryMatches
  };
}

module.exports = {
  CATEGORY_GROUPS,
  classifySignal
};
