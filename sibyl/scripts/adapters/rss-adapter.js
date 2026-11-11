// Websites and blogs the user follows, by RSS or Atom feed. Some publishers allow their feeds
// for personal use only, so check each feed's terms before adding it. Items older than
// maxAgeDays (default 3) are left out; the newest item of each feed ranks first.

const { requestText } = require('../lib/http');
const { parseFeed } = require('../lib/feed');
const { makeSignal } = require('../lib/signals');

function feedList(config) {
  return (Array.isArray(config.feeds) ? config.feeds : [])
    .map(feed => (typeof feed === 'string' ? { url: feed } : feed))
    .filter(feed => /^https?:\/\//i.test(String(feed?.url || '')));
}

function feedSignals(xml, feedConfig, options = {}, now = Date.now()) {
  const feed = parseFeed(xml);
  const name = feedConfig.name || feed.title || new URL(feedConfig.url).hostname;
  const cutoff = now - (Number(options.maxAgeDays) || 3) * 86400000;
  return feed.items
    .filter(item => item.title && (!item.published || Date.parse(item.published) >= cutoff))
    .slice(0, Number(options.maxItemsPerFeed) || 20)
    .map((item, index) => makeSignal({
      platform: 'rss',
      sourceType: 'feed_item',
      board: name,
      title: item.title,
      rank: index + 1,
      heat: 0,
      url: item.link,
      evidence: item.link ? [{ title: item.title, url: item.link, source: name, snippet: item.summary.slice(0, 300) }] : []
    }));
}

async function fetchRssSignals(config = {}) {
  const feeds = feedList(config);
  const results = await Promise.allSettled(feeds.map(async feed => {
    const xml = await requestText(feed.url, { timeout: config.timeout || 15000, retries: config.retries ?? 1 });
    return feedSignals(xml, feed, config);
  }));
  const signals = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') signals.push(...result.value);
    else errors.push(`${feeds[index].name || feeds[index].url}: ${result.reason.message}`);
  });
  if (errors.length) {
    const error = new Error(`Feeds failed: ${errors.join('; ')}`);
    error.partialSignals = signals;
    throw error;
  }
  return signals;
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'rss');
  return signal?.url ? `[${signal.board || 'Website'}](${signal.url})` : '';
}

const source = {
  id: 'rss',
  label: 'Website',
  access: 'script (RSS or Atom)',
  weight: 0.5,
  sourceTypeWeights: { feed_item: 0.7 },
  heatUnit: '',
  showBoard: true,
  displayOrder: 6,
  defaultRole: 'community',
  fetch: fetchRssSignals,
  link
};

module.exports = {
  feedSignals,
  fetchRssSignals,
  source
};
