// Keyword matching rules, unchanged from weibo-monitor/scripts/keywords-loader.js (v1.3.20).
// A keyword is a plain word or { word, requireAny?, exclude? }.

function getKeywordWord(keyword) {
  if (typeof keyword === 'object' && keyword.word) {
    return keyword.word;
  }
  return keyword;
}

function getKeywordExcludes(keyword) {
  if (typeof keyword === 'object' && keyword.exclude) {
    return keyword.exclude;
  }
  return [];
}

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
        /[一-龥]/.test(lowerKeyword[0]) &&
        /[一-龥]/.test(prevChar)
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
  const isLongChineseEntity = /^[一-龥]{3,}$/.test(lowerKeyword);
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

module.exports = {
  getKeywordExcludes,
  getKeywordRequireAny,
  getKeywordWord,
  keywordMatchesTitle
};
