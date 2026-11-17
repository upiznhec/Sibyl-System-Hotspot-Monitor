#!/usr/bin/env node

// Instagram: hashtags and accounts read through a fake Graph API, the token script, and the
// self-check line. The live API was tested by hand on 2026-11-15 (docs/testing.md).

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ig = require('./adapters/instagram-adapter');
const { QUESTIONS, setUpToken } = require('./instagram-token');
const { parseEnvText } = require('./lib/env-file');

const now = Date.now();
const hoursAgo = hours => new Date(now - hours * 3600000).toISOString().replace(/\.\d{3}Z$/, '+0000');
const post = (id, likes, comments, extra = {}) => ({
  id, like_count: likes, comments_count: comments, caption: `Post ${id}\nmore text`,
  permalink: `https://www.instagram.com/p/${id}/`, timestamp: hoursAgo(5), media_type: 'IMAGE', ...extra
});

// Helpers.
assert.strictEqual(ig.captionTitle('Final scores from Sunday night’s action! 👏\nmore'), 'Final scores from Sunday night’s action! 👏');
assert.strictEqual(ig.captionTitle('https://t.co/x\n\nWatch this'), 'Watch this');
assert.strictEqual(ig.captionTitle('', '#nba post'), '#nba post');
assert.ok(ig.captionTitle('word '.repeat(60)).length <= 142);
assert.deepStrictEqual(ig.hashtagList(['#NBA', 'nba', 'sun screen', { tag: 'nfl', topic: 'Sports' }]),
  [{ name: 'nba', topic: null }, { name: 'nfl', topic: 'Sports' }]);
assert.deepStrictEqual(ig.accountList(['@ESPN', 'house of highlights', { username: 'nba', topic: 'Sports' }]),
  [{ name: 'espn', topic: null }, { name: 'nba', topic: 'Sports' }]);

// Account posts count only when they take off: at least twice the usual, within 3 days.
const chosen = ig.selectPosts([
  { ...post('a1', 100, 0), kind: 'account_post', board: '@espn', usual: 40 },
  { ...post('a2', 50, 0), kind: 'account_post', board: '@espn', usual: 40 },
  { ...post('a3', 900, 0, { timestamp: hoursAgo(100) }), kind: 'account_post', board: '@espn', usual: 40 },
  ...Array.from({ length: 12 }, (_, i) => ({ ...post(`r${i}`, i, 0), kind: 'hashtag_recent', board: '#nba' })),
  { ...post('t1', 5000, 10), kind: 'hashtag_top', board: '#nba' },
  { ...post('t1', 5000, 10), kind: 'hashtag_recent', board: '#nba' }
], {}, now);
assert.deepStrictEqual(chosen.map(item => item.id).slice(0, 2), ['t1', 'a1']);
assert.ok(!chosen.some(item => item.id === 'a2' || item.id === 'a3'), 'usual or old account posts are left out');
assert.strictEqual(chosen.filter(item => item.kind === 'hashtag_recent').length, 9,
  'the 10 busiest newest posts per hashtag, less t1, which is already a top post');
assert.strictEqual(chosen.filter(item => item.id === 't1').length, 1, 'a post is reported once');

// A fake Graph API.
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.push(url.pathname + url.search);
  const q = Object.fromEntries(url.searchParams);
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const route = url.pathname.replace(/^\/v27\.0\//, '');
  if (route === 'oauth/access_token') return send(200, { access_token: 'LONGTOKEN', token_type: 'bearer', expires_in: 5184000 });
  if (route === 'me/accounts') {
    if (q.access_token !== 'LONGTOKEN') return send(400, { error: { message: 'bad token' } });
    return send(200, { data: [{ id: 'P1', name: 'Test Page', access_token: server.pageToken, instagram_business_account: { id: 'IG1', username: 'tester' } }] });
  }
  if (!['T', 'PAGETOKEN', 'LONGTOKEN'].includes(q.access_token)) return send(400, { error: { message: 'Invalid OAuth access token' } });
  if (route === 'IG1' && /business_discovery\.username\(tester\)/.test(q.fields || '')) {
    if (q.access_token === server.rejectToken) return send(400, { error: { message: 'Unsupported request' } });
    return send(200, { business_discovery: { followers_count: 10, id: 'X' }, id: 'IG1' });
  }
  if (route === 'ig_hashtag_search') return send(200, { data: q.q === 'nba' ? [{ id: 'H1' }] : [] });
  if (route === 'H1/top_media') return send(200, { data: [post('t1', 5000, 10), post('t2', 300, 5)] });
  if (route === 'H1/recent_media') return send(200, { data: [post('r1', 80, 2), post('t1', 5000, 10)] });
  if (route === 'IG1' && /business_discovery\.username\(espn\)/.test(q.fields || '')) {
    return send(200, { business_discovery: { username: 'espn', followers_count: 1000, media: { data: [post('e1', 900, 30), post('e2', 100, 2), post('e3', 120, 1)] } } });
  }
  return send(404, { error: { message: `no route ${route}` } });
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.SIBYL_GRAPH_BASE = base;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-ig-'));
  try {
    // Reading hashtags and accounts.
    process.env.SIBYL_IG_ACCESS_TOKEN = 'T';
    process.env.SIBYL_IG_USER_ID = 'IG1';
    const config = { hashtags: ['nba', { tag: 'nosuchtag', topic: 'Sports' }], accounts: [{ username: 'espn', topic: 'Sports' }] };
    const signals = await ig.fetchInstagramSignals(config, { dataDir });
    assert.deepStrictEqual(signals.map(s => [s.title, s.board, s.sourceType]), [
      ['Post t1', '#nba', 'hashtag_top'],
      ['Post e1', '@espn', 'account_post'],
      ['Post t2', '#nba', 'hashtag_top'],
      ['Post r1', '#nba', 'hashtag_recent']
    ]);
    const espn = signals.find(s => s.board === '@espn');
    assert.strictEqual(espn.heat, 930);
    assert.strictEqual(espn.topicHint, 'Sports');
    assert.strictEqual(espn.url, 'https://www.instagram.com/p/e1/');
    assert.strictEqual(signals[0].evidence[0].snippet, 'Post t1\nmore text', 'the caption is kept for summaries');
    const count = requests.length;
    await ig.fetchInstagramSignals(config, { dataDir });
    assert.strictEqual(requests.length, count, 'within the hour, the saved result is used');
    assert.ok(requests.every(r => /[?&]access_token=T(&|$)/.test(r)), 'every request carries the saved token');
    await assert.rejects(ig.fetchInstagramSignals({ hashtags: [] }, { dataDir }), /nothing to read/);
    delete process.env.SIBYL_IG_ACCESS_TOKEN;
    await assert.rejects(ig.fetchInstagramSignals(config, { dataDir }), /instagram-token\.js/);

    // The token script: the Page token is used when Instagram accepts it, otherwise the long-lived token.
    server.pageToken = 'PAGETOKEN';
    let result = await setUpToken({ appId: '123', appSecret: 's', shortToken: 'short', now });
    assert.deepStrictEqual([result.kind, result.token, result.userId, result.expires], ['page', 'PAGETOKEN', 'IG1', '']);
    server.rejectToken = 'PAGETOKEN';
    result = await setUpToken({ appId: '123', appSecret: 's', shortToken: 'short', now });
    assert.deepStrictEqual([result.kind, result.token], ['user', 'LONGTOKEN']);
    assert.strictEqual(result.expires.slice(0, 10), new Date(now + 5184000 * 1000).toISOString().slice(0, 10));
    server.rejectToken = null;

    // The questions are numbered, so that the person can see when all three are answered.
    assert.deepStrictEqual(Object.values(QUESTIONS).map(question => question.slice(0, 7)), ['1 of 3.', '2 of 3.', '3 of 3.']);

    // The command saves to .env, prints no token, and refuses to run without a terminal.
    const env = { ...process.env, SIBYL_DATA_DIR: dataDir, SIBYL_GRAPH_BASE: base };
    const script = path.join(__dirname, 'instagram-token.js');
    // Run without blocking, so this process's fake API can answer the script.
    const run = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--from-stdin'], { env });
      let stdout = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stdout += chunk; });
      child.on('error', reject);
      child.on('close', status => resolve({ status, stdout, stderr: '' }));
      child.stdin.end('123\nsecret-value\nshort-token\n');
    });
    assert.strictEqual(run.status, 0, run.stdout + run.stderr);
    ['PAGETOKEN', 'LONGTOKEN', 'secret-value', 'short-token'].forEach(secret => assert.ok(!run.stdout.includes(secret), `does not print ${secret}`));
    const saved = parseEnvText(fs.readFileSync(path.join(dataDir, '.env'), 'utf8'));
    assert.deepStrictEqual([saved.SIBYL_IG_ACCESS_TOKEN, saved.SIBYL_IG_USER_ID, saved.SIBYL_IG_TOKEN_EXPIRES], ['PAGETOKEN', 'IG1', '']);
    assert.ok(!('SIBYL_IG_APP_SECRET' in saved), 'the app secret is not saved');
    assert.strictEqual(spawnSync(process.execPath, [script], { env, input: '', encoding: 'utf8' }).status, 2);

    // The self-check: Meta's limits and the token's end.
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
      topics: [{ name: 'Sports', keywords: ['nba'] }],
      platforms: { instagram: { enabled: true, hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`), accounts: ['espn'] } }
    }));
    const check = extra => spawnSync(process.execPath, [path.join(__dirname, 'check-deploy.js')], {
      env: { ...env, SIBYL_CONFIG: '', SIBYL_SKIP_NETWORK_CHECK: '1', SIBYL_IG_ACCESS_TOKEN: 'x', SIBYL_IG_USER_ID: 'IG1', SIBYL_IG_TOKEN_EXPIRES: '', ...extra },
      encoding: 'utf8'
    }).stdout;
    assert.match(check({}), /\[WARN\] Instagram: 31 hashtags; Meta allows 30/);
    assert.match(check({ SIBYL_IG_TOKEN_EXPIRES: new Date(now + 3.5 * 86400000).toISOString() }), /the token expires in 3 day\(s\)/);
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
      topics: [{ name: 'Sports', keywords: ['nba'] }],
      platforms: { instagram: { enabled: true, hashtags: ['nba', 'nfl'], accounts: ['espn'] } }
    }));
    assert.match(check({}), /\[OK\] Instagram: token set \(does not expire\); 2 hashtag\(s\), 1 account\(s\), about 5 requests an hour/);
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log('instagram tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
