#!/usr/bin/env node

const assert = require('assert');

const { clusterSignals } = require('./lib/clusterer');
const {
  applySemanticEventMerge,
  buildCandidateBatches,
  selectPreSummaryCandidates
} = require('./lib/event-threader');

function signal(title, platform, rank, matchedKeywords = ['C罗']) {
  return {
    title,
    platform,
    platformLabel: platform === 'weibo' ? '微博' : '抖音',
    sourceType: 'hot_search',
    rank,
    heat: 1000000,
    matchedKeywords,
    category: '体育',
    capturedAt: '2026-07-03T05:00:00.000Z'
  };
}

function groupFor(candidates, memberIndexes, title) {
  return {
    memberIds: memberIndexes.map(index => `e${index + 1}`),
    confidence: 0.95,
    sharedEventAnchor: '葡萄牙对克罗地亚的世界杯淘汰赛及赛后',
    relationType: 'direct_aftermath',
    memberEvidence: memberIndexes.map(index => ({
      memberId: `e${index + 1}`,
      evidence: `${candidates[index].mainSignal.title}直接属于该场淘汰赛时间线`
    })),
    title,
    reason: '这些话题分别描述同一场淘汰赛的比赛结果与直接赛后动态'
  };
}

async function main() {
  const clusters = clusterSignals([
    signal('C罗打破淘汰赛零进球纪录', 'douyin', 23),
    signal('C罗哭了', 'weibo', 1),
    signal('足球内置芯片救了葡萄牙', 'weibo', 18, ['葡萄牙']),
    signal('C罗被换下不高兴', 'weibo', 37)
  ], {}, { similarityThreshold: 1.1 });

  clusters.forEach(cluster => {
    cluster.eventSummary = `${cluster.mainSignal.title}发生在葡萄牙淘汰克罗地亚晋级的同一场比赛。`;
  });
  const batches = buildCandidateBatches(clusters);
  assert.strictEqual(batches.length, 1);
  assert.strictEqual(batches[0].length, 4);

  const preSummaryCandidates = selectPreSummaryCandidates(clusters, {
    preSummaryCandidateLimit: 3
  });
  assert.strictEqual(preSummaryCandidates.length, 3);

  const first = await applySemanticEventMerge(clusters, {}, {}, {
    decideGroups: candidates => ({
      groups: [groupFor(candidates, [0, 1], 'C罗助葡萄牙晋级并在赛后落泪')],
      titles: []
    })
  });
  assert.strictEqual(first.length, 1);

  first.forEach(cluster => {
    if (!cluster.eventSummary) {
      cluster.eventSummary = '葡萄牙淘汰克罗地亚晋级，比赛结果与赛后动态持续受到讨论。';
    }
  });
  const second = await applySemanticEventMerge(first, {}, {}, {
    decideGroups: candidates => ({
      groups: [groupFor(
        candidates,
        candidates.map((_, index) => index),
        'C罗助葡萄牙晋级，破纪录及赛后动态引关注'
      )],
      titles: []
    })
  });

  assert.strictEqual(second.length, 1);
  assert.strictEqual(second[0].signals.length, 4);
  console.log('二轮事件收敛合并测试通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
