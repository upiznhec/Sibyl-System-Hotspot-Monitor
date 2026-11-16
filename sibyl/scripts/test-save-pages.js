#!/usr/bin/env node

// save-pages.js: a page that fails a check keeps its last saved list; pages.json is replaced in one
// step. Each case below is a failure seen when Claude set Sibyl up (2026-11-15).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { rowsChecksum, savePages } = require('./save-pages');
const { loadPages } = require('./lib/pages-file');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-pages-'));
const staging = path.join(dir, 'daily-pages');
const now = Date.parse('2026-11-15T16:00:00-08:00');
const hoursAgo = hours => new Date(now - hours * 3600000).toISOString();
const rows = (count, prefix) => Array.from({ length: count }, (_, i) => ({ rank: i + 1, title: `${prefix} ${i + 1}` }));

const TIKTOK = { source: 'tiktok-creative-center', region: 'US', industry: 'Beauty & Personal Care', topic: 'Beauty' };
const TRENDING = { source: 'google-trends', view: 'trending', region: 'US', category: 'Beauty and Fashion', topic: 'Beauty' };
const EXPLORE = { source: 'google-trends', view: 'explore', region: 'US', keyword: 'sunscreen', topic: 'Beauty' };

function stage(name, section) {
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, name), typeof section === 'string' ? section : JSON.stringify(section));
}
function saved() {
  return JSON.parse(fs.readFileSync(path.join(dir, 'pages.json'), 'utf8')).pages;
}
const find = (sections, page) => sections.find(s => s.source === page.source &&
  (s.view || '') === (page.view || '') && (s.industry || s.category || s.keyword) === (page.industry || page.category || page.keyword));

try {
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ dailyPages: [TIKTOK, TRENDING, EXPLORE] }));
  fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify({ pages: [
    { ...TIKTOK, readAt: hoursAgo(24), items: rows(100, '#tag') },
    { ...TRENDING, readAt: hoursAgo(24), items: rows(2, 'trend') },
    { ...EXPLORE, readAt: hoursAgo(24), items: rows(5, 'old query') },
    { source: 'google-trends', view: 'explore', keyword: 'retired keyword', readAt: hoursAgo(30), items: rows(1, 'kept') }
  ] }));

  // A logged-out TikTok list, an unfiltered Google list, a good Explore page and a broken file.
  stage('tiktok.json', { ...TIKTOK, readAt: hoursAgo(0.5), items: rows(3, '#top') });
  stage('trending.json', { ...TRENDING, readAt: hoursAgo(0.5), items: rows(660, 'any trend') });
  const explore = rows(8, 'new query');
  stage('explore-sunscreen.json', { ...EXPLORE, readAt: hoursAgo(0.2), shown: 'sunscreen', items: explore, checksum: rowsChecksum(explore) });
  stage('broken.json', '{"source": ');
  const first = savePages({ dataDir: dir, now });
  assert.strictEqual(first.refreshed, 1);
  assert.match(first.results.find(r => r.page.startsWith('TikTok')).reason, /login may have expired/);
  assert.match(first.results.find(r => r.page.startsWith('Google Trending')).reason, /unfiltered list/);
  assert.match(first.results.find(r => r.page === 'broken.json').reason, /not valid JSON/);
  let pages = saved();
  assert.strictEqual(find(pages, TIKTOK).items.length, 100, 'the logged-out list does not replace the full one');
  assert.strictEqual(find(pages, TIKTOK).readAt, hoursAgo(24), 'the kept list keeps its old time');
  assert.strictEqual(find(pages, EXPLORE).items[0].title, 'new query 1');
  assert.strictEqual(find(pages, EXPLORE).topic, 'Beauty');
  ['shown', 'checksum'].forEach(field => assert.ok(!(field in find(pages, EXPLORE)), `${field} is not saved`));
  assert.ok(pages.some(s => s.keyword === 'retired keyword'), 'sections not on the list are left alone');
  assert.ok(!fs.existsSync(path.join(dir, 'pages.json.new')));
  assert.deepStrictEqual(fs.readdirSync(staging), [], 'staged files are cleared');
  assert.strictEqual(loadPages({}, dir, now).problems.length, 0);

  // The wrong industry, a mistyped row, a partial read and a file from hours ago are refused too.
  const tiktok = rows(100, '#tag new');
  stage('tiktok.json', { ...TIKTOK, readAt: hoursAgo(0.5), shown: 'Tech & Electronics', items: tiktok });
  const typed = rows(8, 'query');
  stage('explore.json', { ...EXPLORE, readAt: hoursAgo(0.5), items: [...typed.slice(0, 7), { rank: 8, title: 'qeury 8' }], checksum: rowsChecksum(typed) });
  stage('trending.json', { ...TRENDING, readAt: hoursAgo(5), total: 2, items: rows(2, 'trend') });
  const second = savePages({ dataDir: dir, now });
  assert.strictEqual(second.refreshed, 0);
  assert.match(second.results[0].reason, /showed "Tech & Electronics"/);
  assert.match(second.results[1].reason, /more than 3/);
  assert.match(second.results[2].reason, /checksum does not match/);
  stage('trending.json', { ...TRENDING, readAt: hoursAgo(0.5), total: 2, items: rows(1, 'trend') });
  assert.match(savePages({ dataDir: dir, now }).results[1].reason, /1 rows saved but the page showed 2/);

  // Everything right: every page is refreshed and the command exits 0.
  stage('tiktok.json', { ...TIKTOK, readAt: new Date().toISOString(), shown: 'Beauty & Personal Care', items: tiktok, checksum: rowsChecksum(tiktok) });
  stage('trending.json', { ...TRENDING, readAt: new Date().toISOString(), total: 2, items: rows(2, 'trend') });
  stage('explore.json', { ...EXPLORE, readAt: new Date().toISOString(), noData: true, items: [] });
  const run = spawnSync(process.execPath, [path.join(__dirname, 'save-pages.js')], {
    env: { ...process.env, SIBYL_DATA_DIR: dir, SIBYL_CONFIG: '' }, encoding: 'utf8'
  });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /3 of 3 pages refreshed/);
  pages = saved();
  assert.strictEqual(find(pages, TIKTOK).items[0].title, '#tag new 1');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'daily-pages.log'), 'utf8').trim().split('\n').length, 4);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('save pages tests passed');
