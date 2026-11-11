// YouTube search through the YouTube Data API v3 (free API key). Search has its own daily
// limit (about 100 searches a day when checked), so results are kept for 60 minutes by default
// (minIntervalMinutes). Off by default. The query comes from platforms["youtube-search"].queries,
// or from the topics' keywords joined with "|", which YouTube reads as OR. The key comes from
// SIBYL_YOUTUBE_API_KEY (preferred) or platforms["youtube-search"].apiKey.
// Not tested against the live API yet: no key was available.

const { requestJson } = require('../lib/http');
const { decodeEntities } = require('../lib/feed');
const { makeSignal } = require('../lib/signals');
const { cached } = require('../lib/source-cache');

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

function topicQuery(topicSettings, limit = 6) {
  const words = [];
  for (const category of topicSettings?.categories || []) {
    for (const keyword of category.keywords || []) {
      const word = typeof keyword === 'object' ? keyword.word : keyword;
      if (word && /^[\x20-\x7e]+$/.test(word) && !words.includes(word)) words.push(word);
    }
  }
  return words.slice(0, limit).map(word => (word.includes(' ') ? `"${word}"` : word)).join('|');
}

async function search(query, config, key, country) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    q: query,
    maxResults: String(Math.min(50, Number(config.maxResults) || 25)),
    publishedAfter: new Date(Date.now() - (Number(config.publishedWithinDays) || 2) * 86400000)
      .toISOString().replace(/\.\d{3}Z$/, 'Z'),
    regionCode: country,
    key
  });
  if (config.relevanceLanguage) params.set('relevanceLanguage', config.relevanceLanguage);
  const found = await requestJson(`${SEARCH_URL}?${params.toString()}`, { retries: 0, timeout: 20000 });
  const videos = (found?.items || [])
    .filter(item => item?.id?.videoId)
    .map(item => ({
      id: item.id.videoId,
      title: decodeEntities(item.snippet?.title || ''),
      channel: decodeEntities(item.snippet?.channelTitle || ''),
      description: decodeEntities(item.snippet?.description || ''),
      publishedAt: item.snippet?.publishedAt || ''
    }));
  if (!videos.length) return [];
  const stats = await requestJson(`${VIDEOS_URL}?${new URLSearchParams({
    part: 'statistics',
    id: videos.map(video => video.id).join(','),
    key
  }).toString()}`, { retries: 0, timeout: 20000 });
  const views = new Map((stats?.items || []).map(item => [item.id, Number(item.statistics?.viewCount) || 0]));
  return videos.map(video => ({ ...video, views: views.get(video.id) || 0 }));
}

async function fetchYouTubeSearchSignals(config = {}, context = {}) {
  const key = process.env.SIBYL_YOUTUBE_API_KEY || config.apiKey || '';
  if (!key) throw new Error('YouTube search is on but no API key is set (SIBYL_YOUTUBE_API_KEY)');
  const country = String(config.regionCode || context.config?.country || 'US').toUpperCase();
  const queries = (Array.isArray(config.queries) && config.queries.length
    ? config.queries
    : [topicQuery(context.topicSettings)])
    .map(query => String(query || '').trim())
    .filter(Boolean)
    .slice(0, Number(config.maxQueries) || 3);
  if (!queries.length) throw new Error('YouTube search has no query: set queries or topic keywords');

  const { items } = await cached(context.dataDir, 'youtube-search', {
    key: `${country}:${queries.join('||')}`,
    minutes: config.minIntervalMinutes ?? 60
  }, async () => {
    const all = [];
    for (const query of queries) all.push(...await search(query, config, key, country));
    return all;
  });

  const seen = new Set();
  return items
    .filter(video => !seen.has(video.id) && seen.add(video.id))
    .sort((a, b) => b.views - a.views)
    .map((video, index) => {
      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
      return makeSignal({
        platform: 'youtube-search',
        sourceType: 'video_search',
        title: video.title,
        rank: index + 1,
        heat: video.views,
        url,
        evidence: [{ title: video.title, url, source: video.channel, snippet: video.description.slice(0, 300) }]
      });
    });
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'youtube-search');
  return signal?.url ? `[YouTube](${signal.url})` : '';
}

const source = {
  id: 'youtube-search',
  label: 'YouTube search',
  access: 'api (free key, daily limit)',
  weight: 0.7,
  sourceTypeWeights: { video_search: 0.8 },
  heatUnit: 'views',
  heatReference: 1000000,
  showBoard: false,
  displayOrder: 3,
  defaultRole: 'support',
  fetch: fetchYouTubeSearchSignals,
  link
};

module.exports = {
  fetchYouTubeSearchSignals,
  source,
  topicQuery
};
