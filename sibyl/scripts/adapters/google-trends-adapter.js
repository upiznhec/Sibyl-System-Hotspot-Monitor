// Google Trends, from two lists:
// - The RSS feed, read by the script on every run: about 10 current searches for one country,
//   each with an approximate search count and up to 3 news links. Category and time filters
//   have no effect on it. Instant alerts come from this list.
// - The Trending Now page for the chosen categories. There is no feed for categories, so the
//   user's agent reads the page once a day into pages.json (see lib/pages-file.js).

const { requestText } = require('../lib/http');
const { blocks, parseFeed, tagText } = require('../lib/feed');
const { makeSignal, parseNumber } = require('../lib/signals');
const { sectionsFor } = require('../lib/pages-file');

const RSS_URL = 'https://trends.google.com/trending/rss';

function exploreUrl(term, geo) {
  const params = new URLSearchParams({ date: 'now 7-d', geo, q: term });
  return `https://trends.google.com/trends/explore?${params.toString()}`;
}

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function newsFromRss(xml) {
  return blocks(xml, 'ht:news_item')
    .map(item => ({
      title: tagText(item, 'ht:news_item_title'),
      url: tagText(item, 'ht:news_item_url'),
      source: tagText(item, 'ht:news_item_source'),
      snippet: tagText(item, 'ht:news_item_snippet')
    }))
    .filter(item => item.title && isWebUrl(item.url));
}

function newsFromPage(news) {
  return (Array.isArray(news) ? news : [])
    .map(item => ({
      title: String(item?.title || '').trim(),
      url: String(item?.url || '').trim(),
      source: String(item?.source || '').trim(),
      snippet: String(item?.snippet || '').trim()
    }))
    .filter(item => item.title && isWebUrl(item.url))
    .slice(0, 5);
}

function rssSignals(xml, geo, maxItems = 25) {
  return parseFeed(xml).items.slice(0, maxItems).map((item, index) => {
    const traffic = tagText(item.xml, 'ht:approx_traffic');
    return makeSignal({
      platform: 'google-trends',
      sourceType: 'trending_rss',
      title: item.title,
      rank: index + 1,
      heat: parseNumber(traffic),
      heatText: traffic || undefined,
      url: exploreUrl(item.title, geo),
      evidence: newsFromRss(item.xml)
    });
  }).filter(signal => signal.title);
}

function pageSignals(pages, geo) {
  return sectionsFor(pages, 'google-trends').flatMap(section => section.items.map(item => {
    const volume = item.searchVolume ?? item.volume ?? '';
    return makeSignal({
      platform: 'google-trends',
      sourceType: 'trending_page',
      board: section.category || null,
      title: item.title,
      rank: item.rank,
      heat: parseNumber(volume),
      heatText: volume ? String(volume) : undefined,
      url: isWebUrl(item.url) ? item.url : exploreUrl(item.title, section.region || geo),
      evidence: newsFromPage(item.news)
    });
  })).filter(signal => signal.title);
}

async function fetchGoogleTrendsSignals(config = {}, context = {}) {
  const geo = String(config.geo || context.config?.country || 'US').toUpperCase();
  const fromPages = config.pages === false ? [] : pageSignals(context.pages, geo);
  if (config.rss === false) return fromPages;
  try {
    const xml = await requestText(`${RSS_URL}?geo=${encodeURIComponent(geo)}`, {
      timeout: config.timeout || 15000,
      retries: config.retries ?? 1
    });
    return [...rssSignals(xml, geo, config.maxItems || 25), ...fromPages];
  } catch (error) {
    const failure = new Error(`Google Trends RSS failed: ${error.message}`);
    failure.partialSignals = fromPages;
    throw failure;
  }
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'google-trends');
  return signal?.url ? `[Google Trends](${signal.url})` : '';
}

const source = {
  id: 'google-trends',
  label: 'Google Trends',
  access: 'script (RSS), agent-page (category page)',
  weight: 1.0,
  sourceTypeWeights: { trending_rss: 1.0, trending_page: 0.95 },
  heatUnit: 'searches',
  heatReference: 500000,
  showBoard: false,
  alertSourceTypes: ['trending_rss'],
  displayOrder: 0,
  defaultRole: 'seed',
  fetch: fetchGoogleTrendsSignals,
  link
};

module.exports = {
  exploreUrl,
  fetchGoogleTrendsSignals,
  pageSignals,
  rssSignals,
  source
};
