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

// A title of one common word, such as "them" or "found", names no event. Such a title joins only
// items with the same title (lib/clusterer.js), so a post that merely uses the word cannot confirm it.
function isCommonWordTitle(title) {
  const words = lowerWords(title);
  if (words.length !== 1) return false;
  return isStopWord(words[0]) || text().commonWords?.has(words[0]) === true;
}

// A post's caption made short enough to name an event: links, emoji and the run of hashtags at the
// end removed, "#" and "@" dropped inside the text, and cut at a word before `max` characters.
// In testing, captions such as "Thank you so much merab.dvalishvili sabaalazishvili 🥋🔥" named events.
function shortTitle(title = '', max = 80) {
  const original = String(title).trim();
  const tidy = value => value
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/[#@]([\p{L}\p{N}_.]+)/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-–—:|,.;]+|[\s\-–—:|,;]+$/g, '');
  const withoutLinks = original.replace(/https?:\/\/\S+/g, ' ');
  let short = tidy(withoutLinks.replace(/(?:\s*#[\p{L}\p{N}_]+)+[\s\p{Extended_Pictographic}\u{FE0F}.!]*$/u, ' '));
  if (short.length < 3) short = tidy(withoutLinks);
  if (!short) return original;
  if (short.length <= max) return short;
  const cut = short.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
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
  isCommonWordTitle,
  isHashtag,
  keywordWords,
  lowerWords,
  shortTitle
};
