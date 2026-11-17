#!/usr/bin/env node

// Saves Sibyl's Instagram token, so that no token passes through a chat. The person runs this in
// their own terminal after approving their Meta app in Graph API Explorer (AGENTS.md, "Instagram"):
// 1. It asks for the app ID (shown), the app secret and the Explorer's token (neither shown), as
//    questions numbered 1 of 3 to 3 of 3, so that the person can see when all three are answered.
// 2. It exchanges the token for a long-lived one (about 60 days), finds the Facebook Page linked to
//    an Instagram professional account, and tries that Page's token, which does not expire, on
//    Instagram. If Instagram does not accept it, the long-lived token is kept instead.
// 3. It saves SIBYL_IG_ACCESS_TOKEN, SIBYL_IG_USER_ID and SIBYL_IG_TOKEN_EXPIRES (empty when the
//    token does not expire) in data/.env, readable only by the person. The app secret is used
//    once and not saved. Nothing secret is printed.
// Usage: node scripts/instagram-token.js [--page="Page name or ID"]
// --from-stdin reads the app ID, app secret and token from three lines of standard input (tests).

const { envFilePath, writeEnvValue } = require('./lib/env-file');
const { requestJson } = require('./lib/http');
const { readHidden, readLines, readVisible } = require('./lib/prompt');
const { getDataDir } = require('./lib/snapshot-store');

// In testing, a person said the token was saved while the script still waited for the third answer.
const QUESTIONS = {
  appId: '1 of 3. App ID (App settings, Basic, in your Meta app): ',
  appSecret: '2 of 3. App secret (same page, Show). It is not shown on screen.',
  token: "3 of 3. Graph API Explorer's access token (copy button next to it). It is not shown on screen."
};

function graphBase(version) {
  const base = String(process.env.SIBYL_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');
  return `${base}/${version}`;
}

async function graphGet(version, path, params) {
  return requestJson(`${graphBase(version)}/${path}?${new URLSearchParams(params).toString()}`, { retries: 0, timeout: 20000 });
}

function pickPage(pages, wanted) {
  const linked = pages.filter(page => page?.instagram_business_account?.id);
  if (!wanted) return { linked, page: linked.length === 1 ? linked[0] : null };
  const match = linked.find(page => page.id === wanted || String(page.name || '').toLowerCase() === wanted.toLowerCase());
  return { linked, page: match || null };
}

// Exchange, find the Page and choose the token. Returns what to save; throws with a plain message.
async function setUpToken({ appId, appSecret, shortToken, page: wanted = '', version = 'v27.0', choose = null, now = Date.now() }) {
  const long = await graphGet(version, 'oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken
  });
  if (!long?.access_token) throw new Error('Meta did not return a long-lived token; check the app ID and secret, and make a new token in Graph API Explorer');

  const pages = (await graphGet(version, 'me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: long.access_token
  }))?.data || [];
  let { linked, page } = pickPage(pages, wanted);
  if (!linked.length) {
    throw new Error(pages.length
      ? 'None of your Pages is linked to an Instagram professional account. Link one in the Instagram app (Edit profile, Page), then make a new token.'
      : 'The token sees no Facebook Page. In Graph API Explorer, make a new token and choose your Page and Instagram account in the pop-up.');
  }
  if (!page && choose) page = await choose(linked);
  if (!page) throw new Error(`Several Pages are linked to Instagram accounts: run again with --page="${linked[0].name}" (or another of: ${linked.map(item => item.name).join(', ')})`);

  const ig = page.instagram_business_account;
  const tryToken = async token => {
    try {
      const found = await graphGet(version, ig.id, {
        fields: `business_discovery.username(${ig.username}){followers_count}`,
        access_token: token
      });
      return Boolean(found?.business_discovery);
    } catch (error) {
      return false;
    }
  };
  if (page.access_token && await tryToken(page.access_token)) {
    return { token: page.access_token, kind: 'page', expires: '', userId: ig.id, username: ig.username, pageName: page.name };
  }
  if (!await tryToken(long.access_token)) {
    throw new Error('Instagram did not accept the token. Check that the app has instagram_basic and instagram_manage_insights, then make a new token.');
  }
  const seconds = Number(long.expires_in) || 60 * 86400;
  return {
    token: long.access_token,
    kind: 'user',
    expires: new Date(now + seconds * 1000).toISOString(),
    userId: ig.id,
    username: ig.username,
    pageName: page.name
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fromStdin = args.includes('--from-stdin');
  const wanted = (args.find(arg => arg.startsWith('--page=')) || '').slice('--page='.length).replace(/^"|"$/g, '');
  const version = (args.find(arg => arg.startsWith('--version=')) || '').slice('--version='.length) || 'v27.0';
  if (!fromStdin && !process.stdin.isTTY) {
    console.log('Run this in your own terminal: it asks you to paste the app secret and the token there, so that they never go through a chat.');
    process.exit(2);
  }

  let appId;
  let appSecret;
  let shortToken;
  try {
    if (fromStdin) {
      [appId, appSecret, shortToken] = (await readLines(process.stdin)).map(line => String(line || '').trim());
    } else {
      console.log('Sibyl: Instagram token. It asks 3 questions. Have Graph API Explorer open with your app chosen and a token made.');
      appId = (await readVisible(QUESTIONS.appId)).trim();
      console.log(QUESTIONS.appSecret);
      appSecret = (await readHidden()).trim();
      console.log(QUESTIONS.token);
      shortToken = (await readHidden()).trim();
      console.log('All 3 answered. Checking with Meta; this takes a few seconds.');
    }
  } catch (error) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(1);
  }
  if (!/^\d+$/.test(appId || '') || !appSecret || !shortToken) {
    console.log('The app ID must be a number, and the app secret and token cannot be empty. Nothing was saved.');
    process.exit(1);
  }

  const choose = fromStdin ? null : async linked => {
    linked.forEach((page, index) => console.log(`${index + 1}. ${page.name} (@${page.instagram_business_account.username})`));
    const answer = Number((await readVisible('Which Page? Type its number: ')).trim());
    return linked[answer - 1] || null;
  };

  let result;
  try {
    result = await setUpToken({ appId, appSecret, shortToken, page: wanted, version, choose });
  } catch (error) {
    console.log(`Nothing was saved: ${error.message}`);
    process.exit(1);
  }
  const dataDir = getDataDir();
  writeEnvValue(dataDir, 'SIBYL_IG_ACCESS_TOKEN', result.token);
  writeEnvValue(dataDir, 'SIBYL_IG_USER_ID', result.userId);
  writeEnvValue(dataDir, 'SIBYL_IG_TOKEN_EXPIRES', result.expires);
  console.log(`Saved in ${envFilePath(dataDir)}: Instagram @${result.username} through the Page "${result.pageName}".`);
  console.log(result.kind === 'page'
    ? 'The token does not expire. Removing the app from Facebook (Settings, Business integrations) stops it.'
    : `The token lasts until ${result.expires.slice(0, 10)}; run this again before then. Sibyl's check warns a week ahead.`);
  console.log('Now tell your agent that it is saved. Do not paste anything from this into the chat.');
}

if (require.main === module) main();

module.exports = { QUESTIONS, pickPage, setUpToken };
