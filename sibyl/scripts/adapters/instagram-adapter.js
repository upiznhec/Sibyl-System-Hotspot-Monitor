// Instagram through the person's own Meta app (Instagram API with Facebook login), in
// development mode: no App Review is needed while the app is used only by its own people
// (tested 2026-11-15). Free; the limits are requests, not money. Off by default.
//
// It reads, about once an hour (minIntervalMinutes):
// - hashtags (platforms.instagram.hashtags): each hashtag's top posts and its newest posts of the
//   last 24 hours, with caption, likes, comments and link. Meta allows 30 different hashtags per
//   Instagram account in any 7 days, and reading a hashtag's posts counts as using it.
// - accounts (platforms.instagram.accounts): public business or creator accounts through Business
//   Discovery; a recent post with at least twice the account's usual likes and comments counts as
//   taking off.
// About 200 requests an hour are allowed for one person: each hashtag costs 2 a run, each
// account 1. The token and the Instagram account ID come from SIBYL_IG_ACCESS_TOKEN and
// SIBYL_IG_USER_ID (scripts/instagram-token.js saves both).

const { requestJson } = require('../lib/http');
const { makeSignal } = require('../lib/signals');
const { cached } = require('../lib/source-cache');

const MAX_HASHTAGS = 30;
const MEDIA_FIELDS = 'id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp';
const ACCOUNT_MEDIA_FIELDS = 'id,caption,like_count,comments_count,view_count,media_type,media_product_type,permalink,timestamp';

function graphBase(config = {}) {
  const base = String(process.env.SIBYL_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');
  return `${base}/${config.graphVersion || 'v27.0'}`;
}

// "#NBA", "nba" or { "tag": "nba", "topic": "Sports" } -> { name: "nba", topic }.
function hashtagList(list) {
  return (Array.isArray(list) ? list : [])
    .map(entry => (typeof entry === 'object' && entry ? entry : { tag: entry }))
    .map(entry => ({ name: String(entry.tag || entry.name || '').replace(/^#/, '').trim().toLowerCase(), topic: entry.topic || null }))
    .filter(entry => /^[\p{L}\p{N}_]+$/u.test(entry.name))
    .filter((entry, index, all) => all.findIndex(other => other.name === entry.name) === index);
}

// "@espn", "espn" or { "username": "espn", "topic": "Sports" } -> { name: "espn", topic }.
function accountList(list) {
  return (Array.isArray(list) ? list : [])
    .map(entry => (typeof entry === 'object' && entry ? entry : { username: entry }))
    .map(entry => ({ name: String(entry.username || entry.name || '').replace(/^@/, '').trim().toLowerCase(), topic: entry.topic || null }))
    .filter(entry => /^[a-z0-9._]+$/.test(entry.name))
    .filter((entry, index, all) => all.findIndex(other => other.name === entry.name) === index);
}

// The first line of a caption, without links, cut at about 140 characters.
function captionTitle(caption, fallback = '') {
  const line = String(caption || '')
    .split(/\r?\n/)
    .map(part => part.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim())
    .find(Boolean) || '';
  if (!line) return fallback;
  if (line.length <= 140) return line;
  const cut = line.slice(0, 140);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 100))}…`;
}

function interactions(post) {
  return (Number(post.like_count) || 0) + (Number(post.comments_count) || 0);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function graphGet(config, path, params, token) {
  const query = new URLSearchParams({ ...params, access_token: token });
  return requestJson(`${graphBase(config)}/${path}?${query.toString()}`, { retries: 0, timeout: 20000 });
}

async function hashtagIds(config, context, hashtags, userId, token) {
  // A hashtag's ID never changes, so the lookups are kept for 7 days. Looking up the same
  // hashtag again within 7 days does not use another of the 30.
  const { items } = await cached(context.dataDir, 'instagram-hashtags', {
    key: `${userId}:${hashtags.map(tag => tag.name).sort().join(',')}`,
    minutes: 7 * 24 * 60
  }, async () => {
    const ids = {};
    for (const tag of hashtags) {
      const found = await graphGet(config, 'ig_hashtag_search', { user_id: userId, q: tag.name }, token);
      if (found?.data?.[0]?.id) ids[tag.name] = found.data[0].id;
    }
    return ids;
  });
  return items || {};
}

async function readAll(config, context, hashtags, accounts, userId, token) {
  const problems = [];
  const posts = [];
  const ids = hashtags.length ? await hashtagIds(config, context, hashtags, userId, token) : {};
  for (const tag of hashtags) {
    const id = ids[tag.name];
    if (!id) {
      problems.push(`#${tag.name}: no such hashtag`);
      continue;
    }
    for (const [edge, kind, limit] of [
      ['top_media', 'hashtag_top', Number(config.postsPerHashtag) || 25],
      ['recent_media', 'hashtag_recent', Number(config.recentPerHashtag) || 25]
    ]) {
      try {
        const page = await graphGet(config, `${id}/${edge}`, { user_id: userId, fields: MEDIA_FIELDS, limit: String(Math.min(50, limit)) }, token);
        (page?.data || []).forEach(post => posts.push({ ...post, kind, board: `#${tag.name}`, topic: tag.topic }));
      } catch (error) {
        problems.push(`#${tag.name} ${edge}: ${error.message}`);
      }
    }
  }
  const perAccount = Math.min(25, Number(config.postsPerAccount) || 10);
  for (const account of accounts) {
    try {
      const found = await graphGet(config, userId, {
        fields: `business_discovery.username(${account.name}){username,followers_count,media.limit(${perAccount}){${ACCOUNT_MEDIA_FIELDS}}}`
      }, token);
      const media = found?.business_discovery?.media?.data || [];
      const usual = median(media.map(interactions));
      media.forEach(post => posts.push({
        ...post,
        kind: 'account_post',
        board: `@${found.business_discovery.username || account.name}`,
        topic: account.topic,
        usual
      }));
    } catch (error) {
      problems.push(`@${account.name}: ${error.message}`);
    }
  }
  if (!posts.length && problems.length) throw new Error(`Instagram: ${problems.slice(0, 3).join('; ')}`);
  return { posts, problems };
}

// Posts to report: the top posts of each hashtag, the busiest of its newest posts, and account
// posts of the last 3 days with at least twice that account's usual likes and comments.
function selectPosts(posts, config = {}, now = Date.now()) {
  const keepRecent = Number(config.keepRecentPerHashtag) || 10;
  const recentByTag = new Map();
  const chosen = [];
  posts.forEach(post => {
    if (post.kind === 'hashtag_top') chosen.push(post);
    if (post.kind === 'hashtag_recent') {
      if (!recentByTag.has(post.board)) recentByTag.set(post.board, []);
      recentByTag.get(post.board).push(post);
    }
    if (post.kind === 'account_post') {
      const age = now - Date.parse(post.timestamp || '');
      const takingOff = interactions(post) >= Math.max(2 * post.usual, 1);
      if (Number.isFinite(age) && age <= 3 * 86400000 && takingOff) chosen.push(post);
    }
  });
  recentByTag.forEach(list => chosen.push(...list.sort((a, b) => interactions(b) - interactions(a)).slice(0, keepRecent)));
  const seen = new Set();
  return chosen
    .filter(post => post.id && !seen.has(post.id) && seen.add(post.id))
    .sort((a, b) => interactions(b) - interactions(a));
}

async function fetchInstagramSignals(config = {}, context = {}) {
  const token = process.env.SIBYL_IG_ACCESS_TOKEN || '';
  const userId = process.env.SIBYL_IG_USER_ID || config.userId || '';
  if (!token || !userId) {
    throw new Error('Instagram is on but SIBYL_IG_ACCESS_TOKEN or SIBYL_IG_USER_ID is not set: run node scripts/instagram-token.js');
  }
  const allTags = hashtagList(config.hashtags);
  const hashtags = allTags.slice(0, MAX_HASHTAGS);
  const accounts = accountList(config.accounts);
  if (!hashtags.length && !accounts.length) {
    throw new Error('Instagram has nothing to read: set platforms.instagram.hashtags or accounts');
  }

  const { items } = await cached(context.dataDir, 'instagram', {
    key: `${userId}:${hashtags.map(tag => tag.name).join(',')}|${accounts.map(account => account.name).join(',')}`,
    minutes: config.minIntervalMinutes ?? 60
  }, () => readAll(config, context, hashtags, accounts, userId, token));

  return selectPosts(items?.posts || [], config).map((post, index) => {
    const title = captionTitle(post.caption, `${post.board} post`);
    const heat = interactions(post);
    return makeSignal({
      platform: 'instagram',
      sourceType: post.kind,
      board: post.board,
      title,
      rank: index + 1,
      heat,
      url: post.permalink || '',
      engagement: {
        likes: Number(post.like_count) || 0,
        comments: Number(post.comments_count) || 0,
        ...(post.view_count ? { views: Number(post.view_count) } : {})
      },
      evidence: [{ title, url: post.permalink || '', source: post.board, snippet: String(post.caption || '').slice(0, 300) }],
      topicHint: post.topic || null
    });
  });
}

function link(cluster, helpers) {
  const signal = helpers.bestSignalForPlatform(cluster, 'instagram');
  return signal?.url ? `[Instagram](${signal.url})` : '';
}

const source = {
  id: 'instagram',
  label: 'Instagram',
  access: 'api (your own Meta app, free)',
  weight: 0.9,
  sourceTypeWeights: { hashtag_top: 0.9, hashtag_recent: 0.8, account_post: 0.9 },
  heatUnit: 'likes and comments',
  heatReference: 200000,
  showBoard: true,
  // Read about once an hour, so it adds to the briefing and does not raise instant alerts.
  alertSourceTypes: [],
  displayOrder: 3,
  defaultRole: 'seed',
  defaultEnabled: false,
  defaultConfig: { hashtags: [], accounts: [], minIntervalMinutes: 60 },
  fetch: fetchInstagramSignals,
  link
};

module.exports = {
  MAX_HASHTAGS,
  accountList,
  captionTitle,
  fetchInstagramSignals,
  hashtagList,
  selectPosts,
  source
};
