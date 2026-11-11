// Summary material from the news links that sources attach to their items: Google Trends RSS
// gives up to 3 per search, and agent-read pages, feeds and YouTube results can add more.
// Nothing is fetched here; the links were saved with the snapshot. With a model configured the
// summary is written from these headlines; without one, the first headline is used, as v1.3.20
// used the first paragraph of its material.

function evidenceItems(signals = [], limit = 6) {
  const seen = new Set();
  const items = [];
  for (const signal of signals) {
    for (const item of signal?.evidence || []) {
      const key = item?.url || item?.title;
      if (!item?.title || !key || seen.has(key)) continue;
      seen.add(key);
      items.push(item);
      if (items.length >= limit) return items;
    }
  }
  return items;
}

// One line per item: "Headline (Source): snippet".
function evidenceText(items) {
  return items
    .map(item => `${item.title}${item.source ? ` (${item.source})` : ''}${item.snippet ? `: ${item.snippet}` : ''}`)
    .join('\n');
}

// Retriever for lib/event-summary.js: request.signals are the event's items.
async function retrieveNewsEvidence(request = {}) {
  const items = evidenceItems(request.signals || []);
  if (!items.length) {
    return { success: false, retryable: false, failureReason: 'no_news_links' };
  }
  return {
    success: true,
    evidenceText: evidenceText(items),
    sources: items.map(item => ({ title: item.title, url: item.url, source: item.source || '' })),
    routeUsed: 'news-links',
    confidence: items.length >= 2 ? 'medium' : 'low',
    claimStatus: 'supported'
  };
}

module.exports = {
  evidenceItems,
  evidenceText,
  retrieveNewsEvidence
};
