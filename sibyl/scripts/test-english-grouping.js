#!/usr/bin/env node

// English titles: cleaning, grouping by words (not by topic keywords alone), hashtags,
// readable event titles, the translated merge rules, and per-topic exclude words.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });

const { clusterSignals } = require('./lib/clusterer');
const { makeSignal, normalizeForCompare, normalizeTitle } = require('./lib/signals');
const { buildEventFingerprint, buildPrompt, cleanTitle, strongFingerprintMatch } = require('./lib/event-threader');
const { applyTopicExcludeWords } = require('./lib/event-relevance');
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

console.log('English grouping tests passed');
