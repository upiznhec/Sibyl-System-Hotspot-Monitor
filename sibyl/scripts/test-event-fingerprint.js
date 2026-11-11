#!/usr/bin/env node

// Rule-based event fingerprints, without a model: items about the same competition and stage
// that share a name are one event; a different discipline (mixed doubles vs men's singles)
// keeps items apart even when they share a name.

const assert = require('assert');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });
const { clusterSignals } = require('./lib/clusterer');
const { applySemanticEventMerge } = require('./lib/event-threader');

function signal(title, keyword, rank) {
  return {
    title,
    platform: rank % 2 ? 'google-trends' : 'tiktok-creative-center',
    platformLabel: rank % 2 ? 'Google Trends' : 'TikTok',
    sourceType: rank % 2 ? 'trending_rss' : 'hashtag_ranking',
    rank,
    heat: 100000,
    matchedKeywords: [keyword],
    category: 'Sports'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('Silva scores as Portugal beat Croatia in World Cup round of 16', 'football', 1),
    signal('Silva and Kovac embrace after World Cup round of 16 exit', 'football', 2),
    signal('Portugal fans celebrate Silva after World Cup round of 16 win', 'football', 6),
    signal('Lin out of Olympic men\'s singles quarterfinal', 'table tennis', 3),
    signal('Olympic men\'s singles quarterfinal upset as Lin loses', 'table tennis', 4),
    signal('Lin and Zhou advance in Olympic mixed doubles quarterfinal', 'table tennis', 5)
  ], {}, { similarityThreshold: 1.1 });

  const merged = await applySemanticEventMerge(clusters, {}, {}, {
    decideGroups: async () => ({ groups: [], titles: [] })
  });
  const sizes = merged.map(cluster => cluster.signals.length).sort((a, b) => b - a);
  assert.deepStrictEqual(sizes, [3, 2, 1]);
  const mixed = merged.find(cluster => cluster.signals.some(item => item.title.includes('mixed doubles')));
  assert.strictEqual(mixed.signals.length, 1);
  console.log('event fingerprint tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
