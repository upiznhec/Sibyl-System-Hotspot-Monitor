#!/usr/bin/env node

// New sources on made-up samples (test-fixtures/): parsing, age filters, pages.json checks,
// topic hints, the heat scale, which lists may raise alerts, and an English briefing end to end.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en', timeZone: 'America/Los_Angeles' });

const { pageSignals, rssSignals } = require('./adapters/google-trends-adapter');
const { fetchTikTokSignals } = require('./adapters/tiktok-creative-center-adapter');
const { articleItems } = require('./adapters/wikipedia-adapter');
const { channelSignals } = require('./adapters/youtube-channels-adapter');
const { feedSignals } = require('./adapters/rss-adapter');
const { topicQuery } = require('./adapters/youtube-search-adapter');
const { loadPages } = require('./lib/pages-file');
const { compileTopicSettings } = require('./lib/topic-settings');
const { classifySignal } = require('./lib/category-classifier');
const { scoreSignal } = require('./lib/clusterer');
const { formatSignalBrief, makeSignal } = require('./lib/signals');
const { saveSnapshot, snapshotToSignals } = require('./lib/snapshot-store');
const { selectAlerts } = require('./instant-alerts');

const FIXTURES = path.join(__dirname, 'test-fixtures');
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8')
    .replace(/__RECENT_1__/g, iso(now - 86400000))
    .replace(/__RECENT_2__/g, iso(now - 2 * 86400000))
    .replace(/__RECENT_RFC__/g, new Date(now - 3600000).toUTCString())
    .replace(/__READ_AT__/g, iso(now - 2 * 3600000));
}

const TOPIC_LIST = [
  { name: 'Beauty', icon: '🧴', keywords: ['sunscreen', 'skincare', 'makeup', { word: 'SPF', requireAny: ['sunscreen', 'skin'] }] },
  { name: 'Football', icon: '🏈', keywords: ['football', 'nfl'] }
];
const TOPICS = compileTopicSettings({ topics: TOPIC_LIST }, __dirname);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-sources-'));

async function main() {
  // Google Trends RSS: rank, "20K+" counts, news links kept for summaries.
  const rss = rssSignals(fixture('google-trends-rss.xml'), 'US');
  assert.deepStrictEqual(rss.map(s => [s.title, s.rank, s.heat, s.heatText]), [
    ['mineral sunscreen recall', 1, 20000, '20K+'],
    ['state college football schedule', 2, 2000, '2000+'],
    ['weather tomorrow', 3, 500, '500+']
  ]);
  assert.strictEqual(rss[0].evidence.length, 2);
  assert.strictEqual(rss[0].evidence[0].title, 'Brand A recalls mineral sunscreen & stick over labeling');
  assert.ok(rss[0].url.startsWith('https://trends.google.com/trends/explore?'));
  assert.ok(!('evidence' in rss[1]));
  assert.strictEqual(formatSignalBrief(rss[0]), 'Google Trends #1 20K+ searches');

  // pages.json: three usable sections; a section older than 7 days and one without a source are skipped.
  fs.writeFileSync(path.join(dataDir, 'pages.json'), fixture('pages.json'));
  const pages = loadPages({}, dataDir);
  assert.strictEqual(pages.sections.length, 3);
  assert.strictEqual(pages.problems.length, 2);

  const tiktok = await fetchTikTokSignals({}, { pages });
  assert.deepStrictEqual(tiktok.map(s => [s.title, s.rank, s.heat, s.topicHint]), [
    ['#grwm', 1, 325300000, 'Beauty'],
    ['#sunscreenrecall', 2, 73100000, 'Beauty']
  ]);
  assert.strictEqual(tiktok[0].url, 'https://www.tiktok.com/tag/grwm');
  assert.strictEqual(formatSignalBrief(tiktok[0]), 'TikTok #1 325M views');

  const googlePages = pageSignals(pages, 'US');
  assert.deepStrictEqual(googlePages.map(s => [s.sourceType, s.title, s.heat]), [
    ['trending_page', 'example designer collection', 2000],
    ['trending_page', 'mineral sunscreen recall', 20000],
    ['explore_rising', 'live tinted sunscreen', 50],
    ['explore_rising', 'Reef Safe', 5000]
  ]);
  assert.strictEqual(googlePages[1].evidence.length, 1);
  assert.strictEqual(formatSignalBrief(googlePages[3]), 'Google Trends #1 Breakout rising with "sunscreen"');

  // Topics: keywords first; a saved list's topic when nothing matches.
  const topicOf = signal => classifySignal(signal, TOPICS).category;
  assert.strictEqual(topicOf(tiktok[0]), 'Beauty');
  assert.strictEqual(topicOf(rss[1]), 'Football');
  assert.strictEqual(topicOf(rss[2]), null);
  assert.strictEqual(topicOf(makeSignal({ platform: 'google-trends', title: 'nfl draft', topicHint: 'Beauty' })), 'Football');

  // Wikipedia: the main page, special pages and other wikis are left out.
  const wiki = articleItems(JSON.parse(fixture('wikipedia-top.json')).items[0].articles, 'en.wikipedia', 50);
  assert.deepStrictEqual(wiki.map(item => [item.title, item.rank, item.views]), [
    ['Example Singer', 1, 343400],
    ['Sunscreen', 2, 88500],
    ['Star Example: The Series', 3, 60300]
  ]);

  // YouTube channel feed: videos older than 7 days left out, most viewed first.
  const youtube = channelSignals(fixture('youtube-channel.xml'), { id: 'UCaaaaaaaaaaaaaaaaaaaaaa' }, 7, now);
  assert.deepStrictEqual(youtube.map(s => [s.title, s.rank, s.heat, s.board]), [
    ['Sunscreen recall: what to do', 1, 250000, 'Example Skincare'],
    ['My new sunscreen routine', 2, 12000, 'Example Skincare']
  ]);
  assert.strictEqual(formatSignalBrief(youtube[0]), 'YouTube/Example Skincare #1 250K views');

  // Website feed: old posts left out; the post itself is summary material.
  const web = feedSignals(fixture('website-feed.xml'), { url: 'https://blog.example.test/feed' }, {}, now);
  assert.deepStrictEqual(web.map(s => [s.title, s.rank, s.board]), [
    ['Why everyone is talking about the sunscreen recall', 1, 'Example Beauty Blog']
  ]);
  assert.strictEqual(web[0].evidence[0].snippet, 'A short take on the recall.');

  // YouTube search builds its query from the topics' keywords ("|" means OR).
  assert.strictEqual(topicQuery(TOPICS), 'sunscreen|skincare|makeup|SPF|football|nfl');

  // Heat scale: each source's reference value reaches the same 36 points as v1.3.20's 1,000,000.
  const signalWith = (platform, sourceType, heat) => makeSignal({ platform, sourceType, title: 'x', rank: 999, heat });
  assert.strictEqual(scoreSignal(signalWith('google-trends', 'trending_rss', 500000)), scoreSignal(signalWith('weibo', 'hot_search', 999990)));
  assert.ok(scoreSignal(signalWith('google-trends', 'trending_rss', 2000)) < scoreSignal(signalWith('google-trends', 'trending_rss', 500000)));
  assert.strictEqual(scoreSignal(signalWith('google-trends', 'explore_rising', 5000)), Math.round((1.25 + 36) * 0.85));

  // Snapshots keep news links and topics; only the RSS list may raise instant alerts.
  const snapshot = saveSnapshot([...rss, ...googlePages, ...tiktok], { dataDir, capturedAt: iso(now) });
  const restored = snapshotToSignals(snapshot);
  assert.strictEqual(restored.find(s => s.sourceType === 'trending_rss').evidence.length, 2);
  assert.strictEqual(restored.find(s => s.platform === 'tiktok-creative-center').topicHint, 'Beauty');
  const alerts = selectAlerts(snapshot, {
    alerts: { platforms: { 'google-trends': { enabled: true, rankMax: 3, hotMin: 20000 } } }
  }, { reported: {} }, ['google-trends', 'tiktok-creative-center'], TOPICS);
  assert.deepStrictEqual(alerts.map(a => [a.signal.title, a.signal.sourceType, a.category]), [
    ['mineral sunscreen recall', 'trending_rss', 'Beauty'],
    ['state college football schedule', 'trending_rss', 'Football']
  ]);

  // English briefing from this snapshot, through the whole pipeline.
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
    language: 'en',
    timeZone: 'America/Los_Angeles',
    topics: TOPIC_LIST,
    report: { minScore: 0 }
  }));
  const run = spawnSync(process.execPath, [path.join(__dirname, 'sibyl.js'), '--no-ai', '--no-summary', '--no-push'], {
    env: { ...process.env, SIBYL_DATA_DIR: dataDir, SIBYL_CONFIG: '' },
    encoding: 'utf8'
  });
  assert.strictEqual(run.status, 0, run.stderr || run.stdout);
  const report = fs.readFileSync(path.join(dataDir, 'report-latest.md'), 'utf8');
  assert.ok(report.startsWith('# Trend Briefing\n\nGenerated: '));
  ['**Score: ', '**Signals:** ', '**Summary:** No reliable summary yet.', '[TikTok](https://www.tiktok.com/tag/']
    .forEach(text => assert.ok(report.includes(text), `briefing has ${text}`));
  assert.ok(/\[Google Trends\]\(https:\/\/trends\.google\.com\/trends\/explore\?/.test(report));
  assert.ok(!/[一-龥]/.test(report), 'no Chinese text in the English briefing');
  if (process.argv.includes('--print')) console.log(report);

  console.log('source tests passed');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
