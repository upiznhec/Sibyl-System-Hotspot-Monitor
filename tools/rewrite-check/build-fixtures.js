#!/usr/bin/env node
// Builds the rewrite-check fixtures from live snapshots captured with collect-snapshot.js.
// Douyin returned HTTP 403 and Tieba failed TLS verification from the capture machine,
// so this script adds synthetic Douyin and Tieba records, derived from the live Weibo and
// Hupu titles and from titles used in the repo's own tests. Records it adds carry
// "synthetic": true.
//
// Usage: node tools/rewrite-check/build-fixtures.js --from <folder with captured snapshot .json files>

const fs = require('fs');
const path = require('path');
const { normalizeForCompare } = require('../../sibyl/scripts/lib/signals');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const fromDir = argValue('--from');
if (!fromDir) {
  console.error('Usage: node build-fixtures.js --from <captured snapshots folder>');
  process.exit(2);
}

const fixturesDir = path.join(__dirname, 'fixtures');
const snapshotsOut = path.join(fixturesDir, 'snapshots');

// Douyin titles used in sibyl/scripts/test-douyin-topic-summary.js.
const DOUYIN_TEST_TITLES = [
  { topic: 'C罗莫德里奇是对手更是挚友', rank: 22, heat: 8441000 },
  { topic: 'C罗全场最佳球员', rank: 17, heat: 9072000 },
  { topic: 'C罗打破淘汰赛零进球纪录', rank: 25, heat: 7837000 },
  { topic: '王楚钦孙颖莎晋级混双决赛', rank: 14, heat: 9191000 }
];
const TIEBA_ONLY_TITLES = ['英雄联盟S赛总决赛前瞻', '原神新版本角色爆料讨论'];
const WEIBO_RANKS_FOR_DOUYIN = [2, 5, 9, 14, 20, 27, 35, 44];

function record(platform, platformLabel, capturedAt, topic, rank, heat, url, sourceType) {
  return {
    platform,
    platformLabel,
    capturedAt,
    topic,
    normalizedTopic: normalizeForCompare(topic),
    rank,
    heat,
    heatText: '',
    url,
    sourceType,
    board: null,
    synthetic: true
  };
}

function douyinRecords(snapshot, step) {
  const weibo = snapshot.records.filter(item => item.platform === 'weibo');
  const fromWeibo = WEIBO_RANKS_FOR_DOUYIN
    .map(rank => weibo.find(item => item.rank === rank))
    .filter(Boolean)
    .map((item, index) => record(
      'douyin', '抖音', snapshot.capturedAt, item.topic,
      index * 4 + 1 + step, (item.heat || 100000) * (8 + step),
      `https://www.douyin.com/search/${encodeURIComponent(item.topic)}`, 'hot_board'
    ));
  const fromTests = DOUYIN_TEST_TITLES.map(item => record(
    'douyin', '抖音', snapshot.capturedAt, item.topic,
    Math.max(1, item.rank - step * 3), item.heat + step * 300000,
    `https://www.douyin.com/search/${encodeURIComponent(item.topic)}`, 'hot_board'
  ));
  return [...fromWeibo, ...fromTests];
}

function tiebaRecords(snapshot, step) {
  const seen = new Set();
  const hupuTitles = snapshot.records
    .filter(item => item.platform === 'hupu')
    .map(item => item.topic)
    .filter(topic => topic && !seen.has(topic) && seen.add(topic))
    .slice(0, 6);
  return [...hupuTitles, ...TIEBA_ONLY_TITLES].map((topic, index) => record(
    'tieba', '贴吧', snapshot.capturedAt, topic,
    index + 1, 50000 - index * 5000 + step * 1000,
    `https://tieba.baidu.com/hottopic/browse/hottopic?topic_name=${encodeURIComponent(topic)}`, 'hot_topic'
  ));
}

function main() {
  const files = fs.readdirSync(fromDir).filter(file => file.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`No snapshots in ${fromDir}`);

  fs.rmSync(snapshotsOut, { recursive: true, force: true });
  fs.mkdirSync(snapshotsOut, { recursive: true });

  files.forEach((file, step) => {
    const snapshot = JSON.parse(fs.readFileSync(path.join(fromDir, file), 'utf8'));
    const live = snapshot.records.filter(item => !['douyin', 'tieba'].includes(item.platform));
    const records = [...live, ...douyinRecords(snapshot, step), ...tiebaRecords(snapshot, step)];
    const counts = records.reduce((acc, item) => {
      acc[item.platform] = (acc[item.platform] || 0) + 1;
      return acc;
    }, {});
    const fixture = {
      ...snapshot,
      platforms: [...new Set(records.map(item => item.platform))],
      counts,
      errors: [],
      liveCaptureErrors: snapshot.errors || [],
      records
    };
    fs.writeFileSync(path.join(snapshotsOut, file), JSON.stringify(fixture, null, 2));
    console.log(`${file}: ${JSON.stringify(counts)}`);
  });
}

main();
