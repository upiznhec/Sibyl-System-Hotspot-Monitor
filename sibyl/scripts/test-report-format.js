#!/usr/bin/env node

const assert = require('assert');
const { generateReport } = require('./lib/report-generator');

function cluster(title, platform, score) {
  const signal = {
    title,
    platform,
    platformLabel: platform === 'douyin' ? '抖音' : '虎扑',
    rank: 2,
    heat: 1000000
  };
  return {
    mainSignal: signal,
    canonicalTitle: title,
    signals: [signal],
    platformCount: 1,
    platformSummary: [`${signal.platformLabel}#2 100万`],
    score,
    status: 'steady',
    statusLabel: '热度平稳',
    previousScore: score,
    category: '体育',
    eventSummary: '测试事件摘要。',
    aliases: [title],
    keywords: []
  };
}

const report = generateReport([
  cluster('主榜体育事件', 'douyin', 100),
  cluster('社区体育事件', 'hupu', 70)
], {
  generatedAt: '2026-07-03T08:00:00.000Z',
  rawSignalCount: 210,
  signalCount: 72
}, {
  topN: 1,
  minScore: 20,
  requireSeedPlatforms: true,
  seedPlatforms: ['weibo', 'douyin'],
  communityWatchlistN: 3
});

assert(!report.includes('本轮采集'));
assert(!report.includes('本轮播报'));
assert(!report.includes('新出现'));
assert(!report.includes('未命中微博/抖音'));
assert(report.includes('- 体育 ｜ 社区体育事件 ｜ 综合分'));
console.log('综合播报格式测试通过');
