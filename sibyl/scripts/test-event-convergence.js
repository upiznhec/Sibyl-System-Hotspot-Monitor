#!/usr/bin/env node

// Events converge over two merge rounds with a model's decisions (mocked here): candidates that
// share a name or summary are sent together, the ones sharing a name get summaries first, and
// a second round keeps the merged event whole.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { clusterSignals } = require('./lib/clusterer');
const {
  applySemanticEventMerge,
  buildCandidateBatches,
  selectPreSummaryCandidates
} = require('./lib/event-threader');

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
    capturedAt: '2026-07-03T05:00:00.000Z'
  };
}

function groupFor(candidates, memberIndexes, title) {
  return {
    memberIds: memberIndexes.map(index => `e${index + 1}`),
    confidence: 0.95,
    sharedEventAnchor: 'Portugal v Croatia World Cup quarterfinal and its aftermath',
    relationType: 'direct_aftermath',
    memberEvidence: memberIndexes.map(index => ({
      memberId: `e${index + 1}`,
      evidence: `${candidates[index].mainSignal.title} is part of that game's timeline`
    })),
    title,
    reason: 'These items describe the result of one knockout game and what followed it'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('Silva breaks knockout scoring drought', 'tiktok-creative-center', 23),
    signal('Silva in tears after the final whistle', 'google-trends', 1),
    signal('Smart ball chip saves Portugal', 'google-trends', 18),
    signal('Silva unhappy after substitution', 'google-trends', 37)
  ], {}, { similarityThreshold: 1.1 });

  clusters.forEach(cluster => {
    cluster.eventSummary = `${cluster.mainSignal.title} happened in the same World Cup quarterfinal in which Portugal beat Croatia.`;
  });
  const batches = buildCandidateBatches(clusters);
  assert.strictEqual(batches.length, 1);
  assert.strictEqual(batches[0].length, 4);

  const preSummaryCandidates = selectPreSummaryCandidates(clusters, { preSummaryCandidateLimit: 3 });
  assert.strictEqual(preSummaryCandidates.length, 3);

  // Round one: the model joins the two strongest candidates; the shared name, competition and
  // stage join the other two.
  const first = await applySemanticEventMerge(clusters, {}, {}, {
    decideGroups: candidates => ({
      groups: [groupFor(candidates, [0, 1], 'Silva sends Portugal through, then tears at the final whistle')],
      titles: []
    })
  });
  assert.strictEqual(first.length, 1);

  // Round two: asked again about the merged event, the model keeps it whole.
  first.forEach(cluster => {
    if (!cluster.eventSummary) {
      cluster.eventSummary = 'Portugal beat Croatia in the World Cup quarterfinal; the result and what followed are widely discussed.';
    }
  });
  const second = await applySemanticEventMerge(first, {}, {}, {
    decideGroups: candidates => ({
      groups: [groupFor(candidates, candidates.map((_, index) => index), 'Silva sends Portugal through as a smart ball chip and his record trend')],
      titles: []
    })
  });

  assert.strictEqual(second.length, 1);
  assert.strictEqual(second[0].signals.length, 4);
  console.log('two-round event convergence tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
