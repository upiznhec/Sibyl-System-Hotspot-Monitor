// X trends for one place through the official API (Trends by WOEID). It needs an X developer
// account with prepaid credits and cost US$0.010 per request when checked (2026-11-10), so it
// is off by default and requested at most every 30 minutes (minIntervalMinutes). The bearer
// token comes from SIBYL_X_BEARER_TOKEN (preferred) or platforms["x-trends"].bearerToken.
// Not tested against the live API yet: no token was available.

const { requestJson } = require('../lib/http');
const { makeSignal } = require('../lib/signals');
const { cached } = require('../lib/source-cache');

const API = 'https://api.x.com/2/trends/by/woeid/';
// WOEIDs listed in X's documentation. For other places set platforms["x-trends"].woeid.
const WOEIDS = { WORLDWIDE: 1, US: 23424977, GB: 23424975, UK: 23424975, JP: 23424856 };

function searchUrl(title) {
  return `https://x.com/search?q=${encodeURIComponent(title)}`;
}

async function fetchXTrendSignals(config = {}, context = {}) {
  const token = process.env.SIBYL_X_BEARER_TOKEN || config.bearerToken || '';
  if (!token) throw new Error('X trends is on but no bearer token is set (SIBYL_X_BEARER_TOKEN)');
  const country = String(context.config?.country || 'US').toUpperCase();
  const woeid = Number(config.woeid) || WOEIDS[country];
  if (!woeid) throw new Error(`No WOEID known for ${country}; set platforms["x-trends"].woeid`);
  const maxTrends = Math.min(50, Math.max(1, Number(config.maxTrends) || 50));

  const { items } = await cached(context.dataDir, 'x-trends', {
    key: `${woeid}:${maxTrends}`,
    minutes: config.minIntervalMinutes ?? 30
  }, async () => {
    const params = new URLSearchParams({ max_trends: String(maxTrends), 'trend.fields': 'trend_name,tweet_count' });
    const data = await requestJson(`${API}${woeid}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      retries: 0,
      timeout: 20000
    });
    return (data?.data || [])
      .map(trend => ({ name: String(trend?.trend_name || '').trim(), posts: Number(trend?.tweet_count) || 0 }))
      .filter(trend => trend.name);
  });

  return items.map((trend, index) => makeSignal({
    platform: 'x-trends',
    sourceType: 'x_trend',
    title: trend.name,
    rank: index + 1,
    heat: trend.posts,
    url: searchUrl(trend.name)
  }));
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'x-trends');
  return signal?.url ? `[X](${signal.url})` : '';
}

const source = {
  id: 'x-trends',
  label: 'X',
  access: 'api (paid per request)',
  weight: 1.0,
  sourceTypeWeights: { x_trend: 1.0 },
  heatUnit: 'posts',
  heatReference: 500000,
  showBoard: false,
  alertSourceTypes: ['x_trend'],
  displayOrder: 2,
  defaultRole: 'seed',
  defaultEnabled: false,
  fetch: fetchXTrendSignals,
  link,
  fallbackItemLink: searchUrl
};

module.exports = {
  WOEIDS,
  fetchXTrendSignals,
  source
};
