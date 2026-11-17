// Keeps a topic's routine items out of the main briefing. Each topic may list exclude words
// (topics[].briefingExclude), for example "promo code" or "patch notes"; an event whose titles
// contain one stays in the data files but not in the briefing. v1.3.20 had a single rule for
// routine game updates, with a model check for game items; these per-topic words replace it.
// One title is enough to keep a whole event out: in testing, "vs" in one Instagram post kept out
// an attack that led the briefing, so the test briefing lists what the words kept out.

const { keywordMatchesTitle } = require('./keyword-matcher');

function clusterText(cluster) {
  return [
    cluster.canonicalTitle,
    ...(cluster.aliases || []),
    ...(cluster.signals || []).map(signal => signal.title)
  ].filter(Boolean).join('; ');
}

function applyTopicExcludeWords(clusters, topicSettings) {
  const wordsByTopic = new Map((topicSettings?.categories || []).map(topic => [topic.name, topic.briefingExclude || []]));
  clusters.forEach(cluster => {
    const words = wordsByTopic.get(cluster.category) || [];
    const hit = words.find(word => keywordMatchesTitle(clusterText(cluster), word));
    if (!hit) return;
    const reason = `contains "${hit}", which the topic "${cluster.category}" keeps out of the briefing`;
    cluster.relevance = { eventNature: 'topic_exclude_word', filtered: true, filterReason: reason, source: 'topic-exclude-words', excludeWord: hit };
    cluster.broadcastFiltered = true;
    cluster.broadcastFilterReason = reason;
  });
  return clusters;
}

// The events the exclude words kept out, highest score first, one line each, for the test briefing
// (sibyl.js --print), so that a word which removes a real event is seen before it costs a briefing.
function excludedEventLines(clusters, limit = 10) {
  return clusters
    .filter(cluster => cluster.relevance?.eventNature === 'topic_exclude_word')
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, limit)
    .map(cluster => {
      const sources = Number(cluster.platformCount) || 1;
      return `${cluster.canonicalTitle || cluster.mainSignal?.title || ''}: "${cluster.relevance.excludeWord}" ` +
        `(${sources} source${sources === 1 ? '' : 's'})`;
    });
}

async function applyEventRelevanceFilter(clusters, config = {}) {
  if (config.enabled === false) return clusters;
  return applyTopicExcludeWords(clusters, config.topicSettings);
}

module.exports = {
  applyEventRelevanceFilter,
  applyTopicExcludeWords,
  excludedEventLines
};
