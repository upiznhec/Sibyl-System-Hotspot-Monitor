#!/usr/bin/env node

// Summaries before and after merging: the merge prompt carries known summaries, a merged event
// keeps its members' summaries, and its new summary is written from them without fetching more.

const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.SIBYL_DATA_DIR = path.join(os.tmpdir(), `sibyl-event-summary-merge-${process.pid}`);

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { clusterSignals } = require('./lib/clusterer');
const { applySemanticEventMerge, buildPrompt } = require('./lib/event-threader');
const { applyEventSummaries } = require('./lib/event-summary');

function signal(title, platform, rank) {
  return {
    title,
    platform,
    platformLabel: platform === 'google-trends' ? 'Google Trends' : 'TikTok',
    sourceType: platform === 'google-trends' ? 'trending_rss' : 'hashtag_ranking',
    rank,
    heat: 100000,
    matchedKeywords: ['football'],
    category: 'Sports',
    capturedAt: '2026-07-03T03:00:00.000Z'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('Silva breaks knockout scoring drought', 'tiktok-creative-center', 21),
    signal('Silva and Kovac embrace', 'tiktok-creative-center', 27),
    signal('Silva in tears', 'google-trends', 5)
  ], {}, { similarityThreshold: 1.1 });

  const summaries = new Map([
    ['Silva breaks knockout scoring drought', 'Silva scored in the World Cup knockout game against Croatia and Portugal advanced.'],
    ['Silva and Kovac embrace', 'After Portugal knocked out Croatia, Silva and Kovac embraced on the pitch.'],
    ['Silva in tears', 'Silva was in tears after Portugal advanced.']
  ]);
  clusters.forEach(cluster => {
    cluster.eventSummary = summaries.get(cluster.mainSignal.title);
  });

  const prompt = buildPrompt(clusters, new Map());
  assert.ok(prompt.includes('Silva was in tears after Portugal advanced.'));

  const merged = await applySemanticEventMerge(clusters, {}, { minConfidence: 0.8 }, {
    decideGroups: candidates => ({
      groups: [{
        memberIds: candidates.map((_, index) => `e${index + 1}`),
        confidence: 0.96,
        sharedEventAnchor: 'Portugal v Croatia World Cup knockout game and its aftermath',
        relationType: 'direct_aftermath',
        memberEvidence: candidates.map((cluster, index) => ({
          memberId: `e${index + 1}`,
          evidence: `${cluster.mainSignal.title} happened in or right after that game`
        })),
        title: 'Silva sends Portugal through, then embraces Kovac in tears',
        reason: 'The three items describe one knockout game and what happened right after it'
      }],
      titles: []
    })
  });

  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].eventMerge.memberSummaries.length, 3);

  let retrievalCalls = 0;
  await applyEventSummaries(merged, { eventSummary: { retrievalLimit: 10 } }, {
    retrieveEvidence: async () => {
      retrievalCalls++;
      throw new Error('a merged event must not fetch again');
    },
    summarize: async content => ({
      summary: content.includes('in tears') ? 'Silva scored to send Portugal past Croatia and was in tears after the game.' : ''
    })
  });

  assert.strictEqual(retrievalCalls, 0);
  assert.strictEqual(merged[0].eventSummarySource, 'member-summaries-elixir');
  assert.strictEqual(merged[0].eventSummary, 'Silva scored to send Portugal past Croatia and was in tears after the game.');
  console.log('event summary merge tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
