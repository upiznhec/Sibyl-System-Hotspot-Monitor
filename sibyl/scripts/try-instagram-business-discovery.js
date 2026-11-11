#!/usr/bin/env node

// One-off test: does Instagram Business Discovery work with your Meta app before App Review?
// Business Discovery reads another business or creator account's follower count, posts and the
// posts' likes and comments. If this works, it can become an optional source.
//
// You need: a Meta developer app; an Instagram professional account linked to a Facebook Page;
// a user access token with instagram_basic and pages_read_engagement (Graph API Explorer can
// make one); and your Instagram account's ID. Set them as environment variables, so the token
// is not written in a file or shown:
//   SIBYL_IG_ACCESS_TOKEN, SIBYL_IG_USER_ID, optionally SIBYL_GRAPH_VERSION (default v23.0)
// Usage: node scripts/try-instagram-business-discovery.js <username of a business or creator account>

const { requestJson } = require('./lib/http');

async function main() {
  const target = String(process.argv[2] || '').replace(/^@/, '').trim();
  const token = process.env.SIBYL_IG_ACCESS_TOKEN || '';
  const userId = process.env.SIBYL_IG_USER_ID || '';
  const version = process.env.SIBYL_GRAPH_VERSION || 'v23.0';
  if (!target || !token || !userId) {
    console.log('Usage: SIBYL_IG_ACCESS_TOKEN=… SIBYL_IG_USER_ID=… node scripts/try-instagram-business-discovery.js <username>');
    process.exit(2);
  }

  const fields = `business_discovery.username(${target}){username,followers_count,media_count,` +
    'media.limit(5){caption,like_count,comments_count,timestamp,permalink}}';
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(userId)}?` +
    new URLSearchParams({ fields, access_token: token }).toString();
  try {
    const data = await requestJson(url, { retries: 0, timeout: 20000 });
    const account = data.business_discovery || {};
    const posts = account.media?.data || [];
    console.log(`Business Discovery works: @${account.username}, ${account.followers_count} followers, ${account.media_count} posts.`);
    posts.forEach(post => console.log(`- ${post.timestamp}: ${post.like_count ?? '?'} likes, ${post.comments_count ?? '?'} comments ${post.permalink || ''}`));
  } catch (error) {
    // The error text comes from Meta; it does not contain the token.
    console.log(`Business Discovery did not work: ${error.message}`);
    process.exit(1);
  }
}

main();
