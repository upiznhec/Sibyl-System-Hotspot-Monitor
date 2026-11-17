#!/usr/bin/env node

// English titles: cleaning, grouping by words (not by topic keywords alone), hashtags,
// readable event titles, the translated merge rules, and per-topic exclude words.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });

const { clusterSignals } = require('./lib/clusterer');
const english = require('./lib/english-words');
const { makeSignal, normalizeForCompare, normalizeTitle } = require('./lib/signals');
const { buildEventFingerprint, buildPrompt, cleanTitle, strongFingerprintMatch } = require('./lib/event-threader');
const { applyTopicExcludeWords, excludedEventLines } = require('./lib/event-relevance');
const { compileTopicSettings } = require('./lib/topic-settings');

function item(platform, title, matchedKeywords = [], rank = 1, heat = 1000) {
  const sourceType = platform === 'tiktok-creative-center' ? 'hashtag_ranking' : 'trending_rss';
  return { ...makeSignal({ platform, sourceType, title, rank, heat }), matchedKeywords, category: 'Test' };
}

// Titles keep apostrophes; hashtags and spaced titles share a comparison key.
assert.strictEqual(normalizeTitle(`L'Oréal &amp; "Reef Safe" | #grwm #skincare`), `L'Oréal & Reef Safe #grwm #skincare`);
assert.strictEqual(normalizeForCompare('#SunscreenRecall'), normalizeForCompare('sunscreen recall'));

const groups = clusterSignals([
  item('google-trends', 'mineral sunscreen recall', ['sunscreen'], 1, 20000),
  item('tiktok-creative-center', '#sunscreenrecall', [], 2, 73000000),
  item('google-trends', 'live tinted sunscreen', ['sunscreen'], 2, 50),
  item('google-trends', 'lakers vs celtics', ['lakers', 'celtics'], 5, 50000),
  item('google-trends', 'lakers vs warriors', ['lakers'], 6, 50000),
  item('google-trends', 'coachella 2027', [], 7, 20000),
  item('google-trends', 'coachella lineup', [], 8, 20000),
  item('google-trends', 'taylor swift concert', ['taylor swift'], 9, 20000),
  item('google-trends', 'taylor swift injury', ['taylor swift'], 10, 20000)
], {}, {});
const byTitle = Object.fromEntries(groups.map(cluster => [cluster.canonicalTitle, cluster.aliases.slice().sort()]));

// A hashtag that joins the words of a search term is the same event; the readable title wins.
assert.deepStrictEqual(byTitle['mineral sunscreen recall'], ['#sunscreenrecall', 'mineral sunscreen recall']);
// Sharing only a topic keyword ("sunscreen", "lakers", "taylor swift") is not the same event.
assert.deepStrictEqual(byTitle['live tinted sunscreen'], ['live tinted sunscreen']);
assert.deepStrictEqual(byTitle['lakers vs celtics'], ['lakers vs celtics']);
assert.deepStrictEqual(byTitle['lakers vs warriors'], ['lakers vs warriors']);
assert.deepStrictEqual(byTitle['taylor swift concert'], ['taylor swift concert']);
assert.deepStrictEqual(byTitle['taylor swift injury'], ['taylor swift injury']);
// Years are not event words: "coachella 2027" and "coachella lineup" are one event.
assert.deepStrictEqual(byTitle['coachella 2027'], ['coachella 2027', 'coachella lineup']);

// Merge rules: titles from the model are cleaned; vague or one-word titles are refused.
assert.strictEqual(cleanTitle('Title: "Kirk Cousins traded to the Raiders"'), 'Kirk Cousins traded to the Raiders');
assert.strictEqual(cleanTitle(' "Event title: Brand A recalls mineral sunscreen" '), 'Brand A recalls mineral sunscreen');
assert.strictEqual(cleanTitle('The recall sparks discussion online'), '');
assert.strictEqual(cleanTitle('Recall'), '');

// Fingerprint: same competition and stage plus a shared name is one event without a model.
const left = { category: 'Football', canonicalTitle: 'Team Alpha beats Rovers in Champions League quarterfinal', aliases: [], entityTokens: ['alpha', 'rovers'] };
const right = { category: 'Football', canonicalTitle: 'Rovers coach responds after Champions League quarter-final exit', aliases: [], entityTokens: ['rovers', 'coach'] };
assert.strictEqual(buildEventFingerprint(left).competition, 'champions_league');
assert.strictEqual(buildEventFingerprint(right).stage, 'qf');
assert.ok(strongFingerprintMatch(left, right));
assert.strictEqual(strongFingerprintMatch(left, { ...right, category: 'Beauty' }), null);

// The model prompt is English and lists items as "Source: title".
const prompt = buildPrompt([{ category: 'Football', signals: [{ platformLabel: 'Google Trends', title: 'kirk cousins trade' }], aliases: [], entityTokens: [] }], new Map());
assert.ok(prompt.includes('Google Trends: kirk cousins trade'));
assert.ok(prompt.includes('Sharing only the same person, team, brand or game is not enough to merge.'));
assert.ok(!/[\u4e00-\u9fa5]/.test(prompt));

// Exclude words keep a topic's routine items out of the main briefing.
const settings = compileTopicSettings({ topics: [{ name: 'Games', keywords: ['game'], briefingExclude: ['patch notes'] }] }, __dirname);
const [routine, news] = applyTopicExcludeWords([
  { category: 'Games', canonicalTitle: 'Game X patch notes 1.2', aliases: [], signals: [] },
  { category: 'Games', canonicalTitle: 'Game X servers down for hours', aliases: [], signals: [] }
], settings);
assert.strictEqual(routine.broadcastFiltered, true);
assert.ok(!news.broadcastFiltered);
assert.strictEqual(routine.relevance.excludeWord, 'patch notes');

// One post's title is enough to keep a whole event out ("vs" in testing), so the test briefing
// lists the events kept out, highest score first.
const worldSettings = compileTopicSettings({ topics: [{ name: 'World', keywords: ['iran'], briefingExclude: ['vs'] }] }, __dirname);
const keptOut = applyTopicExcludeWords([
  { category: 'World', canonicalTitle: 'norway vs wales', aliases: [], signals: [], score: 64, platformCount: 1 },
  { category: 'World', canonicalTitle: 'iran attacks bahrain', aliases: [], score: 211, platformCount: 3,
    signals: [{ title: 'iran attacks bahrain' }, { title: '#middleeast Bahrain Vs Iran #war update' }] },
  { category: 'World', canonicalTitle: 'crimea bridge damage', aliases: [], signals: [], score: 150, platformCount: 2 }
], worldSettings);
assert.deepStrictEqual(excludedEventLines(keptOut), [
  'iran attacks bahrain: "vs" (3 sources)',
  'norway vs wales: "vs" (1 source)'
]);

// A one-word title that is a common word joins only the same title (24-hour tests, 17 November:
// "them" from Google's Politics list had taken in posts that only used the word).
const post = (platform, title, rank, heat, matchedKeywords = []) =>
  ({ ...makeSignal({ platform, sourceType: platform === 'instagram' ? 'hashtag_top' : 'search', title, rank, heat }), matchedKeywords, category: 'Test' });
assert.ok(english.isCommonWordTitle('them') && english.isCommonWordTitle('Found') && english.isCommonWordTitle('the'));
assert.ok(!english.isCommonWordTitle('celtics') && !english.isCommonWordTitle('heat') && !english.isCommonWordTitle('them again'));
const commonGroups = clusterSignals([
  item('google-trends', 'them', [], 2, 5000),
  post('instagram', "India is no longer just buying weapons from the world. It's increasingly selling them too. 🇮🇳", 37, 9000, ['india']),
  item('google-trends', 'them', [], 8, 2000),
  item('google-trends', 'jokic', [], 3, 20000),
  post('instagram', 'Jokic with another triple-double 🃏', 12, 40000)
], {}, {});
const commonByTitle = Object.fromEntries(commonGroups.map(cluster => [cluster.canonicalTitle, cluster.signals.length]));
assert.strictEqual(commonByTitle.them, 2, 'the same common word from two lists is one event');
assert.ok(commonGroups.some(cluster => cluster.signals.length === 1 && cluster.mainSignal.platform === 'instagram' && /selling them/.test(cluster.mainSignal.title)),
  'a post that only uses the word stays apart');
assert.strictEqual(commonByTitle.jokic, 2, 'a one-word name still groups with posts about it');

// Event names: a search term when the event has one; otherwise the strongest title in words, with a
// post's emoji, links and closing hashtags removed and long captions cut at a word.
assert.strictEqual(english.shortTitle('Thank you so much merab.dvalishvili sabaalazishvili 🥋🔥'), 'Thank you so much merab.dvalishvili sabaalazishvili');
assert.strictEqual(english.shortTitle('What did the buff do bro 😭#ufc #ufcfightnight #ufcnews'), 'What did the buff do bro');
assert.strictEqual(english.shortTitle('#foryou #merabdvalishvili #ufc'), 'foryou merabdvalishvili ufc');
assert.strictEqual(english.shortTitle('Watch @espn live https://example.test/x #nfl'), 'Watch espn live');
const longCaption = english.shortTitle('The #Vikings are playing Higher by Creed in Kirk Cousins’ final home game and every fan in the stadium is singing along');
assert.ok(longCaption.length <= 80 && longCaption.endsWith('…') && longCaption.startsWith('The Vikings are playing'), longCaption);
const named = clusterSignals([
  post('youtube-search', 'Phillies land All-Star closer Jhoan Duran ahead of MLB trade deadline', 5, 2000000, ['mlb']),
  item('google-trends', 'jhoan duran', [], 20, 2000),
  item('tiktok-creative-center', '#merab', [], 8, 24000000),
  post('instagram', 'Thank you so much merab.dvalishvili sabaalazishvili 🥋🔥 #ufc #mma', 21, 30000)
], {}, {});
const namedTitles = named.map(cluster => cluster.canonicalTitle).sort();
assert.deepStrictEqual(namedTitles, ['Thank you so much merab.dvalishvili sabaalazishvili', 'jhoan duran']);

console.log('English grouping tests passed');
