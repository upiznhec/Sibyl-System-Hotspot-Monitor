// Wikipedia: the most-read pages in one country on the previous day, from the Wikimedia
// pageviews API (no key). Wikimedia publishes one list a day, about a day after the day ends
// (UTC). Once the script has yesterday's list it keeps it until the next day; until Wikimedia
// publishes it, the script looks again every 6 hours (cacheMinutes). Wikimedia rounds these
// per-country counts up ("views_ceil") for privacy.

const { requestJson } = require('../lib/http');
const { makeSignal } = require('../lib/signals');
const { cached, peekCache } = require('../lib/source-cache');

const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country';
// The main page, search page and other non-article pages are left out.
const NON_ARTICLE = /^(Main Page|Special|Wikipedia|File|Image|Portal|Help|Talk|Category|Template|User|Draft|Module|MediaWiki|Book|TimedText|Project|WP)(:|$)/i;

function utcDay(daysBack, now = Date.now()) {
  const date = new Date(now - daysBack * 86400000);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { path: `${date.getUTCFullYear()}/${month}/${day}`, label: `${date.getUTCFullYear()}-${month}-${day}` };
}

function articleItems(articles, project, maxItems) {
  return (articles || [])
    .filter(article => article?.project === project)
    .map(article => ({
      article: String(article.article || ''),
      title: String(article.article || '').replace(/_/g, ' ').trim(),
      views: Number(article.views_ceil ?? article.views) || 0
    }))
    .filter(item => item.title && !NON_ARTICLE.test(item.title))
    .slice(0, maxItems)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

async function loadTopPages(country, project, maxItems) {
  let lastError = null;
  for (let daysBack = 1; daysBack <= 3; daysBack++) {
    const day = utcDay(daysBack);
    try {
      const data = await requestJson(`${API}/${encodeURIComponent(country)}/all-access/${day.path}`, {
        retries: 0,
        timeout: 20000
      });
      return { date: day.label, items: articleItems(data?.items?.[0]?.articles, project, maxItems) };
    } catch (error) {
      lastError = error;
      // Only a day that is not published yet moves on to the day before.
      if (!/^HTTP 404/.test(error.message)) break;
    }
  }
  throw lastError;
}

// One new list a day: keep yesterday's list until the next day once it is saved; look again every
// retryMinutes while only an older list is available.
function wikipediaCacheMinutes(previous, key, expectedDate, retryMinutes = 360) {
  return previous && previous.key === key && previous.items?.date === expectedDate ? 24 * 60 : retryMinutes;
}

async function fetchWikipediaSignals(config = {}, context = {}) {
  const country = String(config.country || context.config?.country || 'US').toUpperCase();
  const project = config.project || 'en.wikipedia';
  const maxItems = Number(config.maxItems) || 50;
  const expected = utcDay(1).label;
  const key = `${country}:${project}:${maxItems}:${expected}`;
  const minutes = wikipediaCacheMinutes(peekCache(context.dataDir, 'wikipedia'), key, expected, config.cacheMinutes ?? 360);
  const { items: top } = await cached(context.dataDir, 'wikipedia', { key, minutes },
    () => loadTopPages(country, project, maxItems));
  const host = /^[a-z-]+\.wikipedia$/.test(project) ? `${project}.org` : 'en.wikipedia.org';
  return (top?.items || []).map(item => makeSignal({
    platform: 'wikipedia',
    sourceType: 'top_pageviews',
    title: item.title,
    rank: item.rank,
    heat: item.views,
    url: `https://${host}/wiki/${encodeURIComponent(item.article)}`
  }));
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'wikipedia');
  return signal?.url ? `[Wikipedia](${signal.url})` : '';
}

const source = {
  id: 'wikipedia',
  label: 'Wikipedia',
  access: 'script (Wikimedia API, daily)',
  weight: 0.7,
  sourceTypeWeights: { top_pageviews: 0.8 },
  heatUnit: 'views',
  heatReference: 1000000,
  showBoard: false,
  displayOrder: 4,
  defaultRole: 'support',
  defaultEnabled: true,
  fetch: fetchWikipediaSignals,
  link
};

module.exports = {
  articleItems,
  fetchWikipediaSignals,
  source,
  wikipediaCacheMinutes
};
