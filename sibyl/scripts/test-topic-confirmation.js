#!/usr/bin/env node

// Items from lists read for a topic (a Trending Now category, Explore's rising searches, a TikTok
// industry) lead the briefing only when a keyword matches or a second source shows the same event;
// otherwise they go to the watch list. Found in testing: "sheltered inlets" rose in Explore for
// "sunscreen" and led a beauty briefing.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { generateReport, selectReportClusters } = require('./lib/report-generator');

function signal(platform, title, extra = {}) {
  const label = platform === 'google-trends' ? 'Google Trends' : 'TikTok';
  return { title, platform, platformLabel: label, sourceType: 'daily_page', rank: 1, heat: 1000, ...extra };
}

function cluster(title, signals, score, keywords = []) {
  return {
    mainSignal: signals[0],
    canonicalTitle: title,
    signals,
    platformCount: new Set(signals.map(item => item.platform)).size,
    platformSummary: [`${signals[0].platformLabel} #1`],
    score,
    status: 'new',
    statusLabel: 'New',
    previousScore: 0,
    category: 'Beauty',
    eventSummary: 'A test summary.',
    aliases: [title],
    keywords
  };
}

const config = {
  topN: 10,
  minScore: 20,
  requireSeedPlatforms: true,
  seedPlatforms: ['google-trends', 'tiktok-creative-center']
};
const generatedAt = '2026-11-15T18:00:00.000Z';

const listOnly = cluster('sheltered inlets',
  [signal('google-trends', 'sheltered inlets', { topicHint: 'Beauty', matchedKeywords: [] })], 65);
const keyword = cluster('mineral sunscreen recall',
  [signal('google-trends', 'mineral sunscreen recall', { topicHint: 'Beauty', matchedKeywords: ['sunscreen'] })], 60, ['sunscreen']);
const twoSources = cluster('#glasskin', [
  signal('tiktok-creative-center', '#glasskin', { topicHint: 'Beauty', matchedKeywords: [] }),
  signal('google-trends', 'glass skin', { topicHint: 'Beauty', matchedKeywords: [] })
], 55);
const feedItem = cluster('Brand A recall',
  [signal('google-trends', 'Brand A recall', { sourceType: 'trending_rss', matchedKeywords: [] })], 50);
const all = [listOnly, keyword, twoSources, feedItem];

// A keyword, a second source, or a list not read for the topic confirms it; a list item alone does not.
assert.deepStrictEqual(selectReportClusters(all, config).map(item => item.canonicalTitle),
  ['mineral sunscreen recall', '#glasskin', 'Brand A recall']);

const report = generateReport(all, { generatedAt }, config);
assert.ok(report.includes('### 1. '), report);
assert.ok(!/### \d+\. .*sheltered inlets/.test(report), 'an unconfirmed list item does not lead the briefing');
assert.ok(/### Watch list[\s\S]*- sheltered inlets/.test(report), 'it stays visible in the watch list');

// When nothing is confirmed, the briefing says so and still shows the watch list.
const onlyListItems = generateReport([listOnly], { generatedAt }, config);
assert.ok(onlyListItems.includes('met the selection rules'), onlyListItems);
assert.ok(onlyListItems.includes('- sheltered inlets'), onlyListItems);

// The rule can be switched off in the config (report.requireTopicConfirmation: false).
assert.deepStrictEqual(
  selectReportClusters([listOnly], { ...config, requireTopicConfirmation: false }).map(item => item.canonicalTitle),
  ['sheltered inlets']);

console.log('topic confirmation tests passed');
