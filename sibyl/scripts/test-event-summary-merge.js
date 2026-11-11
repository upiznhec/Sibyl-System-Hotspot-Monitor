#!/usr/bin/env node
// These tests use the v1.3.20 wording until they are rewritten for English sources.
require('./lib/locale').configureLocale({ language: 'zh', timeZone: 'Asia/Shanghai' });

const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.SIBYL_DATA_DIR = path.join(
  os.tmpdir(),
  `sibyl-event-summary-merge-${process.pid}`
);

const { clusterSignals } = require('./lib/clusterer');
const { applySemanticEventMerge, buildPrompt } = require('./lib/event-threader');
const { applyEventSummaries } = require('./lib/event-summary');

function signal(title, platform, rank) {
  return {
    title,
    platform,
    platformLabel: platform === 'weibo' ? '微博' : '抖音',
    sourceType: 'hot_search',
    rank,
    heat: 1000000,
    matchedKeywords: ['C罗'],
    category: '体育',
    capturedAt: '2026-07-03T03:00:00.000Z'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('C罗打破淘汰赛零进球纪录', 'douyin', 21),
    signal('C罗魔笛紧紧相拥', 'douyin', 27),
    signal('C罗哭了', 'weibo', 5)
  ], {}, { similarityThreshold: 1.1 });

  const summaries = new Map([
    ['C罗打破淘汰赛零进球纪录', 'C罗在葡萄牙对克罗地亚的世界杯淘汰赛中进球，帮助球队晋级。'],
    ['C罗魔笛紧紧相拥', '葡萄牙淘汰克罗地亚后，C罗与莫德里奇在赛后拥抱。'],
    ['C罗哭了', '葡萄牙晋级后，C罗在赛后落泪。']
  ]);
  clusters.forEach(cluster => {
    cluster.eventSummary = summaries.get(cluster.mainSignal.title);
  });

  const prompt = buildPrompt(clusters, new Map());
  assert(prompt.includes('葡萄牙晋级后，C罗在赛后落泪。'));

  const merged = await applySemanticEventMerge(clusters, {}, {
    minConfidence: 0.8
  }, {
    decideGroups: candidates => ({
      groups: [{
        memberIds: candidates.map((_, index) => `e${index + 1}`),
        confidence: 0.96,
        sharedEventAnchor: '葡萄牙对克罗地亚的世界杯淘汰赛及赛后',
        relationType: 'direct_aftermath',
        memberEvidence: candidates.map((cluster, index) => ({
          memberId: `e${index + 1}`,
          evidence: `${cluster.mainSignal.title}直接发生于该场淘汰赛或赛后阶段`
        })),
        title: 'C罗助葡萄牙晋级，赛后与莫德里奇相拥落泪',
        reason: '三条话题分别描述同一场淘汰赛的结果与直接赛后动态'
      }],
      titles: []
    })
  });

  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].eventMerge.memberSummaries.length, 3);

  let retrievalCalls = 0;
  await applyEventSummaries(merged, {
    eventSummary: {
      retrievalLimit: 10
    }
  }, {
    retrieveEvidence: async () => {
      retrievalCalls++;
      throw new Error('合并摘要不应再次联网');
    },
    summarize: async content => ({
      summary: content.includes('赛后落泪')
        ? 'C罗帮助葡萄牙晋级并打破纪录，赛后与莫德里奇相拥落泪。'
        : ''
    })
  });

  assert.strictEqual(retrievalCalls, 0);
  assert.strictEqual(merged[0].eventSummarySource, 'member-summaries-elixir');
  assert.strictEqual(
    merged[0].eventSummary,
    'C罗帮助葡萄牙晋级并打破纪录，赛后与莫德里奇相拥落泪。'
  );
  console.log('事件摘要前置与合并后归纳测试通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
