#!/usr/bin/env node

// Briefing layout (v1.3.20, in English): no run statistics in the briefing, main sources in
// the numbered list, and items seen only on followed sources under "From sources you follow".

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { generateReport } = require('./lib/report-generator');

function cluster(title, platform, platformLabel, score) {
  const signal = { title, platform, platformLabel, sourceType: platform === 'rss' ? 'feed_item' : 'trending_rss', rank: 2, heat: 100000 };
  return {
    mainSignal: signal,
    canonicalTitle: title,
    signals: [signal],
    platformCount: 1,
    platformSummary: [`${platformLabel} #2 100K`],
    score,
    status: 'steady',
    statusLabel: 'Steady',
    previousScore: score,
    category: 'Sports',
    eventSummary: 'A test summary.',
    aliases: [title],
    keywords: []
  };
}

const report = generateReport([
  cluster('Main sports event', 'google-trends', 'Google Trends', 100),
  cluster('Community sports event', 'rss', 'Website', 70)
], {
  generatedAt: '2026-07-03T08:00:00.000Z',
  rawSignalCount: 210,
  signalCount: 72
}, {
  topN: 1,
  minScore: 20,
  requireSeedPlatforms: true,
  seedPlatforms: ['google-trends', 'tiktok-creative-center'],
  communityWatchlistN: 3
});

assert.ok(report.startsWith('# Trend Briefing\n\nGenerated: 2026-07-03 01:00 PDT'));
assert.ok(report.includes('### 1. ▫️ 👀 Main sports event'));
assert.ok(!/210|72 signals|collected/i.test(report), 'run statistics stay out of the briefing');
assert.ok(report.includes('### From sources you follow'));
assert.ok(report.includes('- Sports | Community sports event | Score '));
console.log('briefing format tests passed');
