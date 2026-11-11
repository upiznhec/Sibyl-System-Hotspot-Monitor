#!/usr/bin/env node

// Topic classification with the keyword rules carried over from v1.3.20: "requireAny" (a word
// counts only next to one of these words), "exclude", ties decided by topic order, and the
// topic icon in the briefing.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { classifySignal } = require('./lib/category-classifier');
const { compileTopicSettings } = require('./lib/topic-settings');
const { generateReport } = require('./lib/report-generator');

const settings = compileTopicSettings({
  topics: [
    {
      name: 'AI',
      icon: '🤖',
      keywords: [
        'openai', 'chatgpt', 'gpt-5', 'large language model',
        { word: 'claude', requireAny: ['anthropic', 'ai', 'model', 'chatbot'] },
        { word: 'copilot', requireAny: ['microsoft', 'github', 'ai'] },
        { word: 'altman', requireAny: ['openai', 'sam'] },
        { word: 'gemini', requireAny: ['google', 'ai', 'model'], exclude: ['horoscope'] }
      ]
    },
    {
      name: 'Basketball',
      icon: '🏀',
      keywords: ['nba', 'basketball', 'lakers', { word: 'heat', requireAny: ['miami', 'nba', 'basketball'] }]
    },
    {
      name: 'Esports',
      icon: '🎮',
      keywords: ['lck', 'league of legends', 'faker', { word: 't1', requireAny: ['lck', 'faker', 'worlds', 'esports'] }]
    }
  ]
}, __dirname);

const topicOf = title => classifySignal({ title, platform: 'google-trends' }, settings);

[
  ['OpenAI releases GPT-5', 'AI'],
  ['Anthropic updates its Claude model', 'AI'],
  ['Microsoft Copilot adds agents', 'AI'],
  ['Google Gemini model tops benchmark', 'AI'],
  ['Miami Heat beat the Knicks', 'Basketball'],
  ['Lakers trade rumors', 'Basketball'],
  ['T1 wins Worlds final', 'Esports'],
  // Ties go to the topic listed first.
  ['Faker courtside at NBA game', 'Basketball']
].forEach(([title, topic]) => assert.strictEqual(topicOf(title).category, topic, title));

[
  'Claude Monet exhibition opens',
  'copilot salary for airline pilots',
  'heat wave warning this weekend',
  'T1 diabetes study results',
  'Gemini horoscope for today',
  'weather tomorrow'
].forEach(title => assert.strictEqual(topicOf(title).category, null, title));

const sam = topicOf('Sam Altman says OpenAI will open source a model');
assert.deepStrictEqual(sam.matchedKeywords.sort(), ['altman', 'openai']);

const signal = { title: 'OpenAI releases GPT-5', platform: 'google-trends', platformLabel: 'Google Trends', sourceType: 'trending_rss', rank: 1, heat: 200000 };
const report = generateReport([{
  mainSignal: signal,
  canonicalTitle: signal.title,
  signals: [signal],
  platformCount: 1,
  platformSummary: ['Google Trends #1 200K searches'],
  score: 90,
  status: 'new',
  statusLabel: 'New',
  previousScore: null,
  category: 'AI',
  eventSummary: 'OpenAI released a new model.',
  aliases: [signal.title],
  keywords: ['openai', 'gpt-5']
}], { generatedAt: '2026-07-27T08:00:00.000Z', topicSettings: settings }, {
  topN: 1,
  minScore: 20,
  requireSeedPlatforms: true,
  seedPlatforms: ['google-trends', 'tiktok-creative-center']
});
assert.ok(report.includes('### 1. 🤖 🆕 OpenAI releases GPT-5'));
assert.ok(report.includes('**Summary:** OpenAI released a new model.'));

console.log('topic classification tests passed');
