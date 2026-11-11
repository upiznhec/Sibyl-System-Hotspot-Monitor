// YouTube channels the user follows: each channel's latest 15 videos with view counts, from the
// channel's public feed (no API key). Videos older than maxAgeDays (default 7) are left out.
// Within a channel the most-viewed recent video ranks first.

const { requestText } = require('../lib/http');
const { parseFeed, tagAttribute } = require('../lib/feed');
const { makeSignal } = require('../lib/signals');

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

function channelList(config) {
  return (Array.isArray(config.channels) ? config.channels : [])
    .map(channel => (typeof channel === 'string' ? { id: channel } : channel))
    .filter(channel => /^UC[\w-]{20,}$/.test(String(channel?.id || '')));
}

function channelSignals(xml, channel, maxAgeDays = 7, now = Date.now()) {
  const feed = parseFeed(xml);
  const name = channel.name || feed.title || channel.id;
  const cutoff = now - maxAgeDays * 86400000;
  return feed.items
    .filter(item => item.title && (!item.published || Date.parse(item.published) >= cutoff))
    .map(item => ({ item, views: Number(tagAttribute(item.xml, 'media:statistics', 'views')) || 0 }))
    .sort((a, b) => b.views - a.views)
    .map(({ item, views }, index) => makeSignal({
      platform: 'youtube-channels',
      sourceType: 'channel_video',
      board: name,
      title: item.title,
      rank: index + 1,
      heat: views,
      url: item.link,
      evidence: [{ title: item.title, url: item.link, source: name, snippet: item.summary.slice(0, 300) }]
    }));
}

async function fetchYouTubeChannelSignals(config = {}) {
  const channels = channelList(config);
  const results = await Promise.allSettled(channels.map(async channel => {
    const xml = await requestText(`${FEED_URL}${encodeURIComponent(channel.id)}`, {
      timeout: config.timeout || 15000,
      retries: config.retries ?? 1
    });
    return channelSignals(xml, channel, Number(config.maxAgeDays) || 7);
  }));
  const signals = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') signals.push(...result.value);
    else errors.push(`${channels[index].name || channels[index].id}: ${result.reason.message}`);
  });
  if (errors.length) {
    const error = new Error(`YouTube channel feeds failed: ${errors.join('; ')}`);
    error.partialSignals = signals;
    throw error;
  }
  return signals;
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'youtube-channels');
  return signal?.url ? `[YouTube](${signal.url})` : '';
}

const source = {
  id: 'youtube-channels',
  label: 'YouTube',
  access: 'script (channel feeds)',
  weight: 0.6,
  sourceTypeWeights: { channel_video: 0.8 },
  heatUnit: 'views',
  heatReference: 1000000,
  showBoard: true,
  displayOrder: 5,
  defaultRole: 'community',
  fetch: fetchYouTubeChannelSignals,
  link
};

module.exports = {
  channelSignals,
  fetchYouTubeChannelSignals,
  source
};
