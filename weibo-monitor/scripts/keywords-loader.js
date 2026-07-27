/**
 * 关键词加载模块
 * 提供统一的关键词加载和匹配功能
 */

const fs = require('fs');
const path = require('path');

// 优先从elixir-summarizer加载，如果不存在则回退到workspace/config
const KEYWORDS_FILE_PRIMARY = path.join(__dirname, '..', '..', 'elixir-summarizer', 'scripts', 'keywords.json');
const KEYWORDS_FILE_FALLBACK = path.join(__dirname, '..', '..', '..', 'config', 'keywords.json');

/**
 * 加载关键词配置
 * @returns {Object} 关键词配置对象
 */
function loadKeywords() {
  try {
    // 优先从elixir-summarizer加载
    if (fs.existsSync(KEYWORDS_FILE_PRIMARY)) {
      const config = JSON.parse(fs.readFileSync(KEYWORDS_FILE_PRIMARY, 'utf8'));
      return config;
    }
    // 回退到workspace/config
    if (fs.existsSync(KEYWORDS_FILE_FALLBACK)) {
      const config = JSON.parse(fs.readFileSync(KEYWORDS_FILE_FALLBACK, 'utf8'));
      return config;
    }
  } catch (e) {
    console.error('加载关键词配置失败:', e.message);
  }
  return null;
}

/**
 * 获取所有关键词（扁平化数组）
 * @returns {Array} 所有关键词的数组
 */
function getAllKeywords() {
  const config = loadKeywords();
  if (!config || !config.categories) {
    // 返回默认关键词作为fallback
    return getDefaultKeywords();
  }

  const allKeywords = [];
  for (const category of Object.values(config.categories)) {
    if (category.keywords && Array.isArray(category.keywords)) {
      for (const kw of category.keywords) {
        // 支持对象格式 { word: "xxx", exclude: [...] }
        if (typeof kw === 'object' && kw.word) {
          allKeywords.push(kw);
        } else {
          allKeywords.push(kw);
        }
      }
    }
  }

  return allKeywords;
}

/**
 * 获取关键词的字符串值（用于匹配）
 * @param {string|Object} keyword - 关键词（可能是字符串或对象）
 * @returns {string} 关键词字符串
 */
function getKeywordWord(keyword) {
  if (typeof keyword === 'object' && keyword.word) {
    return keyword.word;
  }
  return keyword;
}

/**
 * 获取关键词的排除词列表
 * @param {string|Object} keyword - 关键词（可能是字符串或对象）
 * @returns {Array} 排除词数组
 */
function getKeywordExcludes(keyword) {
  if (typeof keyword === 'object' && keyword.exclude) {
    return keyword.exclude;
  }
  return [];
}

/**
 * 获取关键词的正向语境词列表
 * @param {string|Object} keyword - 关键词（可能是字符串或对象）
 * @returns {Array} 至少命中一个才允许关键词生效的语境词
 */
function getKeywordRequireAny(keyword) {
  if (typeof keyword === 'object' && Array.isArray(keyword.requireAny)) {
    return keyword.requireAny;
  }
  return [];
}

function hasBasicKeywordMatch(lowerTitle, lowerKeyword, allowChineseSubstring = false) {
  let startIndex = 0;

  while (startIndex <= lowerTitle.length - lowerKeyword.length) {
    const index = lowerTitle.indexOf(lowerKeyword, startIndex);
    if (index === -1) return false;

    let beforeValid = true;
    if (index > 0) {
      const prevChar = lowerTitle[index - 1];
      if (/[a-z0-9]/i.test(prevChar)) beforeValid = false;
      if (
        !allowChineseSubstring &&
        /[\u4e00-\u9fa5]/.test(lowerKeyword[0]) &&
        /[\u4e00-\u9fa5]/.test(prevChar)
      ) {
        beforeValid = false;
      }
    }

    let afterValid = true;
    const endIndex = index + lowerKeyword.length;
    if (endIndex < lowerTitle.length) {
      const nextChar = lowerTitle[endIndex];
      if (
        /[a-z0-9]/i.test(lowerKeyword[lowerKeyword.length - 1]) &&
        /[a-z0-9]/i.test(nextChar)
      ) {
        afterValid = false;
      }
    }

    if (beforeValid && afterValid) return true;
    startIndex = index + 1;
  }

  return false;
}

function keywordMatchesTitle(title, keyword, options = {}) {
  const lowerTitle = String(title || '').toLowerCase();
  const keywordWord = getKeywordWord(keyword);
  if (!keywordWord) return false;

  const lowerKeyword = String(keywordWord).toLowerCase();
  const requireAny = getKeywordRequireAny(keyword);
  const excludeWords = getKeywordExcludes(keyword);
  const isLongChineseEntity = /^[\u4e00-\u9fa5]{3,}$/.test(lowerKeyword);
  const allowChineseSubstring = requireAny.length > 0 || isLongChineseEntity;

  if (!hasBasicKeywordMatch(lowerTitle, lowerKeyword, allowChineseSubstring)) {
    return false;
  }

  if (
    requireAny.length > 0 &&
    !requireAny.some(word => lowerTitle.includes(String(word).toLowerCase()))
  ) {
    return false;
  }

  const matchedExclude = excludeWords.find(word =>
    lowerTitle.includes(String(word).toLowerCase())
  );
  if (matchedExclude) {
    if (options.logExclusion) {
      console.log(`[排除] "${title}" 匹配"${keywordWord}"但包含排除词: ${matchedExclude}`);
    }
    return false;
  }

  return true;
}

/**
 * 按分类获取关键词
 * @param {string} categoryName - 分类名称
 * @returns {Array} 该分类的关键词数组
 */
function getKeywordsByCategory(categoryName) {
  const config = loadKeywords();
  if (!config || !config.categories || !config.categories[categoryName]) {
    return [];
  }
  return config.categories[categoryName].keywords || [];
}

/**
 * 获取所有分类名称
 * @returns {Array} 分类名称数组
 */
function getCategories() {
  const config = loadKeywords();
  if (!config || !config.categories) {
    return [];
  }
  return Object.keys(config.categories).map(key => ({
    key,
    name: config.categories[key].name
  }));
}

/**
 * 检查标题是否匹配关键词
 * @param {string} title - 要检查的标题
 * @param {Array} keywords - 关键词数组（可选，默认使用全部）
 * @returns {boolean} 是否匹配
 */
function isTargetTopic(title, keywords = null) {
  const checkKeywords = keywords || getAllKeywords();
  return checkKeywords.some(keyword =>
    keywordMatchesTitle(title, keyword, { logExclusion: true })
  );
}

/**
 * 获取匹配的关键词列表
 * @param {string} title - 要检查的标题
 * @returns {Array} 匹配的关键词数组
 */
function getMatchedKeywords(title) {
  const keywords = getAllKeywords();
  const matched = [];

  for (const keyword of keywords) {
    const keywordWord = getKeywordWord(keyword);
    if (keywordMatchesTitle(title, keyword)) {
      matched.push(keywordWord);
    }
  }

  return matched;
}

/**
 * 默认关键词（fallback）
 * @returns {Array} 默认关键词数组
 */
function getDefaultKeywords() {
  return [
    '游戏', '电竞', '王者', '荣耀', 'LOL', '英雄联盟', 'DOTA', 'CS', '吃鸡', '和平精英',
    '原神', '崩坏', '星铁', '星穹铁道', '绝区零', '鸣潮', '黑神话', '悟空',
    'Steam', 'Switch', 'PS5', 'Xbox', '任天堂', '索尼', '微软',
    '网易', '腾讯游戏', '米哈游', '鹰角', '叠纸', '游戏科学',
    '光遇', '蛋仔', '第五人格', '明日方舟', '碧蓝', 'FGO', '阴阳师',
    '洛克王国', '异环', '崩坏3', '崩坏学园2', '未定事件簿', '恋与深空', '恋与制作人', '光与夜之恋',
    '时空中的绘旅人', '代号鸢', '如鸢', '重返未来1999', '白荆回廊', '少女前线',
    '碧蓝航线', '蔚蓝档案', 'NIKKE', '胜利女神', '赛马娘', '偶像梦幻祭', 'ES',
    '明日方舟终末地', '终末地', '蓝色星原', '旅谣', '望月', '战双帕弥什', '卡拉彼丘',
    'Uzi', 'Faker', 'TheShy', 'Rookie', 'JackeyLove', 'Meiko',
    'LPL', 'LCK', 'MSI', 'S赛', '世界赛', 'TI', 'Major',
    'BLG', 'TES', 'JDG', 'WBG', 'EDG', 'AL', 'IG', 'LNG', 'NIP', 'WE', 'OMG',
    'UP', 'TT', 'LGD', 'GEN', 'T1', 'DK', 'HLE', 'KT', 'NS', 'KDF', 'BRO', 'BFX',
    'FOX', 'DRX', 'KPL', 'AG', 'AG超玩会', '狼队', '重庆狼队', 'eStar', 'eStarPro', '武汉eStarPro', 'Hero', '南京Hero', '南京Hero久竞',
    'TTG', '广州TTG', 'WB', '北京WB', '佛山DRG', 'DRG', 'KSG', '苏州KSG', 'LGD.NBW', '杭州LGD.NBW',
    'EDG.M', '上海EDG.M', 'RNG.M', '上海RNG.M', 'VG', '厦门VG', 'WE', '西安WE', 'TES.A', '长沙TES.A',
    'DYG', '深圳DYG', 'XYG', '小妖怪', 'MTG', '郑州MTG', 'RW侠', '济南RW侠', 'BOA',
    '一诺', '徐必成', 'Cat', '陈正正', '梦泪', '肖闽辉', 'Fly', '彭云飞', '小胖', '李达亨',
    '花海', '罗思源', '清融', '黄垚钦', '易峥', '刘天豪', '坦然', '孙麟威', '子阳', '向阳',
    '无畏', '杨涛', '久酷', '王滔', '星痕', '王刻勤', '傲寒', '陈俊辉', '铃铛', '王稳强',
    '九尾', '许鑫蓁', '钎城', '周诣涛', '清清', '吴金翔', '不然', '叶康', '风箫', '于翔任',
    '暖阳', '林恒', '乔兮', '曾庆龙', '花卷', '吴育涛', '梓墨', '吴喆杰', '星宇', '李宇浩',
    '鹏鹏', '卢家鹏', '梦岚', '彭俊岚', '青枫', '杜舟', '阿改', '杨延普', '百兽', '房庆友',
    '今屿', '徐翔宇', '妖刀', '钟乐天', '流浪', '张恒', '轻语', '谢欣臻',
    '啊泽', '李涛', '一曲', '周锋', '小玖', '刘行', '晚星', '王恒鸿',
    '小落', '王科', '赤辰', '伯晨赫', '小久', '阳文明', '久龙', '康俊龙',
    '初晨', '陶传凯', '柠栀', '袁俊', 'Silver', '黄本帅', '云黎', '周圳', '小椿', '刘彦春',
    '极光', '周文强', '小羽', '刘佳宇',
    '轩染', '刘明', '长生', '谢承峻', '钟意', '陈家豪', '大帅', '孟家俊',
    '道崽', '杨凯博', '句号', '何伟嘉', '无言', '赵昊宇', '一笙', '李自威',
    '体育', '足球', '篮球', 'NBA', 'CBA', '英超', '西甲', '意甲', '德甲', '法甲',
    '欧冠', '世界杯', '欧洲杯', '亚洲杯', '奥运会', '亚运', '全运会',
    '梅西', 'C罗', '姆巴佩', '哈兰德', '贝林厄姆', '维尼修斯',
    '詹姆斯', '库里', '杜兰特', '约基奇', '字母哥', '东契奇',
    '国乒', '国羽', '女排', '女足', '国足', '网球', '羽毛球', '乒乓球',
    '樊振东', '王楚钦', '孙颖莎', '陈梦', '全红婵', '潘展乐', '马龙',
    'F1', '赛车', '马拉松', '跳水', '体操', '举重'
  ];
}

/**
 * 获取关键词统计信息
 * @returns {Object} 统计信息
 */
function getStats() {
  const config = loadKeywords();
  if (!config || !config.categories) {
    const defaultKeywords = getDefaultKeywords();
    return {
      total: defaultKeywords.length,
      categories: 1,
      version: 'default'
    };
  }

  const categories = Object.keys(config.categories);
  let total = 0;
  const categoryStats = {};

  for (const [key, category] of Object.entries(config.categories)) {
    const count = category.keywords?.length || 0;
    total += count;
    categoryStats[key] = {
      name: category.name,
      count
    };
  }

  return {
    total,
    categories: categories.length,
    version: config.version || 'unknown',
    lastUpdated: config.metadata?.lastUpdated,
    byCategory: categoryStats
  };
}

/**
 * 获取实际使用的关键词文件路径
 * @returns {string} 关键词文件路径
 */
function getKeywordsFilePath() {
  if (fs.existsSync(KEYWORDS_FILE_PRIMARY)) {
    return KEYWORDS_FILE_PRIMARY;
  }
  return KEYWORDS_FILE_FALLBACK;
}

module.exports = {
  loadKeywords,
  getAllKeywords,
  getKeywordsByCategory,
  getCategories,
  isTargetTopic,
  getMatchedKeywords,
  getDefaultKeywords,
  getStats,
  getKeywordWord,
  getKeywordExcludes,
  getKeywordRequireAny,
  keywordMatchesTitle,
  getKeywordsFilePath,
  KEYWORDS_FILE: getKeywordsFilePath()
};

// CLI 支持：如果直接运行此文件，显示统计信息
if (require.main === module) {
  const stats = getStats();
  console.log('=== 关键词库统计 ===');
  console.log(`版本: ${stats.version}`);
  console.log(`最后更新: ${stats.lastUpdated || 'unknown'}`);
  console.log(`总关键词数: ${stats.total}`);
  console.log(`分类数: ${stats.categories}`);
  console.log('\n=== 分类详情 ===');
  if (stats.byCategory) {
    for (const [key, info] of Object.entries(stats.byCategory)) {
      console.log(`${info.name} (${key}): ${info.count} 个关键词`);
    }
  }
}
