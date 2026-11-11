#!/usr/bin/env node
// These tests use the v1.3.20 wording until they are rewritten for English sources.
require('./lib/locale').configureLocale({ language: 'zh', timeZone: 'Asia/Shanghai' });

const assert = require('assert');
const { clusterSignals } = require('./lib/clusterer');
const { applySemanticEventMerge } = require('./lib/event-threader');

function signal(title, keyword, rank) {
  return {
    title,
    platform: rank % 2 ? 'weibo' : 'douyin',
    platformLabel: rank % 2 ? '微博' : '抖音',
    sourceType: 'hot_search',
    rank,
    heat: 1000000,
    matchedKeywords: [keyword],
    category: '体育'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('C罗世界杯淘汰赛首球助葡萄牙晋级', 'C罗', 1),
    signal('C罗莫德里奇世界杯赛后相拥泪别', 'C罗', 2),
    signal('足球内置芯片救了葡萄牙', '葡萄牙', 6),
    signal('国乒男单美国大满贯全军覆没', '王楚钦', 3),
    signal('王楚钦爆冷无缘男单八强', '王楚钦', 4),
    signal('王楚钦孙颖莎混双逆转晋级', '王楚钦', 5)
  ], {}, { similarityThreshold: 1.1 });

  const summaries = {
    'C罗世界杯淘汰赛首球助葡萄牙晋级': '世界杯1/16决赛，葡萄牙淘汰克罗地亚晋级。',
    'C罗莫德里奇世界杯赛后相拥泪别': '葡萄牙淘汰克罗地亚后，C罗与莫德里奇赛后相拥。',
    '国乒男单美国大满贯全军覆没': 'WTT美国大满贯男单比赛，王楚钦负于林德后国乒无人晋级八强。',
    '王楚钦爆冷无缘男单八强': 'WTT美国大满贯男单1/8决赛，王楚钦负于林德。',
    '王楚钦孙颖莎混双逆转晋级': 'WTT美国大满贯混双1/4决赛，王楚钦孙颖莎逆转晋级。'
  };
  clusters.forEach(cluster => {
    cluster.eventSummary = summaries[cluster.mainSignal.title] || '';
  });

  const merged = await applySemanticEventMerge(clusters, {}, {}, {
    decideGroups: async () => ({ groups: [], titles: [] })
  });
  const sizes = merged.map(cluster => cluster.signals.length).sort((a, b) => b - a);
  assert.deepStrictEqual(sizes, [3, 2, 1]);
  const mixed = merged.find(cluster => cluster.signals.some(item => item.title.includes('混双')));
  assert.strictEqual(mixed.signals.length, 1);
  console.log('结构化事件指纹合并测试通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
