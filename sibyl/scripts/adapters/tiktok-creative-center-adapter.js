// TikTok Creative Center hashtag ranking for one region, industry and period (default 7 days),
// with post and view counts. TikTok offers no API for it, so the user's agent reads the page in
// a browser once a day and saves it to pages.json (see lib/pages-file.js). Without login the
// page shows the top 3; a free TikTok for Business login shows more. The user logs in
// themselves; the agent never types the password.

const { makeSignal, parseNumber } = require('../lib/signals');
const { sectionsFor } = require('../lib/pages-file');

function hashtag(title) {
  const name = String(title || '').trim().replace(/^#+/, '');
  return name ? `#${name}` : '';
}

function tagUrl(title) {
  return `https://www.tiktok.com/tag/${encodeURIComponent(hashtag(title).slice(1))}`;
}

async function fetchTikTokSignals(config = {}, context = {}) {
  return sectionsFor(context.pages, 'tiktok-creative-center').flatMap(section =>
    section.items.slice(0, config.maxItems || 100).map(item => makeSignal({
      platform: 'tiktok-creative-center',
      sourceType: 'hashtag_ranking',
      board: section.industry || null,
      title: hashtag(item.title),
      rank: item.rank,
      heat: parseNumber(item.views),
      url: /^https?:\/\//i.test(String(item.url || '')) ? item.url : tagUrl(item.title),
      engagement: { posts: parseNumber(item.posts), views: parseNumber(item.views) }
    }))
  ).filter(signal => signal.title);
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'tiktok-creative-center');
  return signal?.url ? `[TikTok](${signal.url})` : '';
}

const source = {
  id: 'tiktok-creative-center',
  label: 'TikTok',
  access: 'agent-page',
  weight: 1.0,
  sourceTypeWeights: { hashtag_ranking: 1.0 },
  heatUnit: 'views',
  heatReference: 100000000,
  showBoard: false,
  displayOrder: 1,
  defaultRole: 'seed',
  fetch: fetchTikTokSignals,
  link
};

module.exports = {
  fetchTikTokSignals,
  source
};
