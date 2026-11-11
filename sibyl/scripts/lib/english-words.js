// Word helpers for grouping English titles. v1.3.20 compared Chinese titles by pairs of
// characters; English titles are compared by their words instead.

const { text } = require('./locale');

// Lower-case words, apostrophes removed (women's → womens), accents kept.
function lowerWords(title = '') {
  return String(title)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function isStopWord(word) {
  return text().stopWords.has(word) || /^(19|20)\d{2}$/.test(word);
}

// The words that can tell events apart: no stop words, no years, no single letters.
function contentWords(title) {
  return lowerWords(title).filter(word => word.length > 1 && !isStopWord(word));
}

// Words of the topic keywords an item matched. They say which topic an item is in, not which
// event, so two items sharing only them are not the same event.
function keywordWords(keywords = []) {
  return new Set(keywords.flatMap(keyword => lowerWords(typeof keyword === 'object' ? keyword?.word : keyword)));
}

function isHashtag(title) {
  return /^#\S+$/.test(String(title || '').trim());
}

// A hashtag joins words: #sunscreenrecall is "sunscreen" + "recall". True when the hashtag is
// two or more consecutive words of the other title, at least one of them not a topic keyword.
function hashtagJoinsWords(hashtagTitle, otherTitle, genericWords = new Set()) {
  if (!isHashtag(hashtagTitle)) return false;
  const tag = lowerWords(hashtagTitle).join('');
  const words = lowerWords(otherTitle);
  for (let start = 0; start < words.length; start++) {
    let joined = '';
    for (let end = start; end < words.length; end++) {
      joined += words[end];
      if (joined.length > tag.length) break;
      if (joined === tag && end > start) {
        return words.slice(start, end + 1).some(word => !genericWords.has(word) && !isStopWord(word));
      }
    }
  }
  return false;
}

module.exports = {
  contentWords,
  hashtagJoinsWords,
  isHashtag,
  keywordWords,
  lowerWords
};
