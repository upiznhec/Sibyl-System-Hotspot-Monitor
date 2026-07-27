#!/usr/bin/env node

const assert = require('assert');

const { classifySignal } = require('./lib/category-classifier');
const { generateReport } = require('./lib/report-generator');

function assertCategory(title, expectedCategory) {
  const result = classifySignal({ title, platform: 'weibo' });
  assert.strictEqual(
    result.category,
    expectedCategory,
    `${title} 应分类为 ${expectedCategory}，实际为 ${result.category}`
  );
  return result;
}

function assertNotCategory(title, excludedCategory) {
  const result = classifySignal({ title, platform: 'weibo' });
  assert.notStrictEqual(
    result.category,
    excludedCategory,
    `${title} 不应分类为 ${excludedCategory}`
  );
  return result;
}

assertCategory('OpenAI发布GPT-5新模型', 'AI');
assertCategory('DeepSeek开源推理模型', 'AI');
assertCategory('英伟达发布新一代AI芯片', 'AI');
assertCategory('宇树科技展示人形机器人', 'AI');
assertCategory('某品牌AI手机发布会定档', 'AI');
assertCategory('腾讯混元发布新模型', 'AI');
assertCategory('腾讯元宝升级智能体功能', 'AI');
assertCategory('百度文心发布新版本', 'AI');
assertCategory('李彦宏谈文心大模型', 'AI');
assertCategory('马斯克谈Grok新模型', 'AI');
assertCategory('OpenAI的奥特曼谈GPT', 'AI');
assertCategory('寒武纪发布新款AI芯片', 'AI');
assertCategory('全国智算中心建设提速', 'AI');
assertCategory('通用人工智能距离现实还有多远', 'AI');
assertCategory('新模型上下文窗口扩展至百万级', 'AI');
assertCategory('Vibe Coding成为开发者新趋势', 'AI');
assertCategory('深度求索发布技术报告', 'AI');
assertCategory('Mistral发布开源模型', 'AI');
assertCategory('Perplexity推出新搜索产品', 'AI');
assertCategory('面壁智能发布端侧模型', 'AI');
assertCategory('Apple Intelligence迎来升级', 'AI');
assertCategory('微软Copilot加入智能体功能', 'AI');
assertCategory('Scale AI公布新进展', 'AI');
assertCategory('商汤日日新大模型升级', 'AI');
assertCategory('Vidu发布新一代视频模型', 'AI');
assertCategory('Flux图像生成模型更新', 'AI');
assertCategory('英伟达H100需求持续增长', 'AI');
assertCategory('B200加速大模型训练', 'AI');
assertCategory('GPU算力需求快速增长', 'AI');
assertCategory('AMD发布新款AI芯片', 'AI');
assertCategory('台积电扩充英伟达AI芯片产能', 'AI');
assertCategory('英伟达芯片禁令引发关注', 'AI');
assertCategory('Sam Altman谈AI未来', 'AI');
assertCategory('山姆·奥特曼谈大模型竞争', 'AI');
assertCategory('辛顿谈人工智能风险', 'AI');
assertCategory('Elon Musk公布Grok新进展', 'AI');
assertCategory('WAIC今日开幕', 'AI');
assertCategory('世界人工智能大会发布新成果', 'AI');
assertCategory('智源大会公布最新议程', 'AI');
assertCategory('NVIDIA GTC发布新架构', 'AI');
assertCategory('NeurIPS公布最佳论文', 'AI');
assertCategory('OpenAI DevDay宣布新产品', 'AI');
assertCategory('WWDC发布Apple Intelligence新功能', 'AI');
assertCategory('Google I/O展示Gemini新能力', 'AI');
assertCategory('Microsoft Build聚焦Copilot智能体', 'AI');
assertCategory('CES展示多款人形机器人', 'AI');
assertCategory('NBA总决赛结果出炉', '体育');
assertCategory('KPL总决赛结果出炉', '电竞');
assertCategory('Bilibili Gaming晋级总决赛', '电竞');
assertCategory('Gen.G Esports夺冠', '电竞');
assertCategory('王者荣耀新皮肤上线', '游戏');
assertCategory('微软Xbox游戏业务调整', '游戏');
assertCategory('美加墨世界杯赛程公布', '体育');

assert.strictEqual(classifySignal({ title: '某品牌AI美颜功能上线' }).category, null);
assert.strictEqual(classifySignal({ title: '金元宝价格上涨' }).category, null);
assert.strictEqual(classifySignal({ title: '文心雕龙登上热搜' }).category, null);
assert.strictEqual(classifySignal({ title: '李彦宏出席普通企业活动' }).category, null);
assert.strictEqual(classifySignal({ title: '马斯克谈火箭发射' }).category, null);
assert.strictEqual(classifySignal({ title: '迪迦奥特曼登上热搜' }).category, null);
assert.strictEqual(classifySignal({ title: '花海景区进入最佳赏花期' }).category, null);
assert.strictEqual(classifySignal({ title: '寒武纪化石研究取得新进展' }).category, null);
assert.strictEqual(classifySignal({ title: '算力概念股集体上涨' }).category, null);
assert.strictEqual(classifySignal({ title: '美加墨旅游攻略' }).category, null);
assert.strictEqual(classifySignal({ title: '王者归来' }).category, null);
assert.strictEqual(classifySignal({ title: '微软发布Windows更新' }).category, null);
assert.strictEqual(classifySignal({ title: '索尼电影发布新预告' }).category, null);
assert.strictEqual(classifySignal({ title: '网易云音乐年度报告' }).category, null);
assert.strictEqual(classifySignal({ title: '商汤是商朝开国君主' }).category, null);
assert.strictEqual(classifySignal({ title: 'Copilot是飞行员的副驾驶' }).category, null);
assert.strictEqual(classifySignal({ title: 'Flux是物理学中的通量' }).category, null);
assert.strictEqual(classifySignal({ title: 'GPU游戏显卡装机推荐' }).category, null);
assert.strictEqual(classifySignal({ title: 'AMD锐龙游戏装机方案' }).category, null);
assert.strictEqual(classifySignal({ title: '台积电举行普通股东会' }).category, null);
assert.strictEqual(classifySignal({ title: '全球芯片禁令相关新闻汇总' }).category, null);
assert.strictEqual(classifySignal({ title: 'Elon Musk谈火箭发射计划' }).category, null);
assert.strictEqual(classifySignal({ title: 'WWDC发布新系统壁纸' }).category, null);
assert.strictEqual(classifySignal({ title: 'Google I/O公布安卓新功能' }).category, null);
assert.strictEqual(classifySignal({ title: 'Microsoft Build开发者报名开启' }).category, null);
assert.strictEqual(classifySignal({ title: 'CES电视新品集中亮相' }).category, null);
assertNotCategory('混元游戏今日更新', 'AI');

const playerAlias = assertCategory('花海回应近期争议', '电竞');
assert(playerAlias.matchedKeywords.includes('花海'));

assertCategory('Cat担任KPL教练', '电竞');
assertCategory('Fly夺冠后接受采访', '电竞');
assertCategory('Hero晋级KPL季后赛', '电竞');
assertCategory('TT晋级LPL季后赛', '电竞');
assertCategory('AG晋级KPL总决赛', '电竞');
assertCategory('WE晋级LPL季后赛', '电竞');
assert.strictEqual(classifySignal({ title: 'CAT考试报名人数创新高' }).category, null);
assert.strictEqual(classifySignal({ title: 'Fly航班大面积延误' }).category, null);
assert.strictEqual(classifySignal({ title: 'Hero电影发布预告' }).category, null);
assert.strictEqual(classifySignal({ title: 'TT语音推出新功能' }).category, null);
assert.strictEqual(classifySignal({ title: 'AG品牌发布夏季新品' }).category, null);
assert.strictEqual(classifySignal({ title: 'WE ARE THE CHAMPIONS再次走红' }).category, null);

const contextualPerson = assertCategory('OpenAI的奥特曼谈GPT', 'AI');
assert(contextualPerson.matchedKeywords.includes('奥特曼'));

const signal = {
  title: 'OpenAI发布GPT-5新模型',
  platform: 'weibo',
  platformLabel: '微博',
  sourceType: 'hot_search',
  rank: 1,
  heat: 1000000
};
const report = generateReport([{
  mainSignal: signal,
  canonicalTitle: signal.title,
  signals: [signal],
  platformCount: 1,
  platformSummary: ['微博#1 100万'],
  score: 90,
  status: 'new',
  statusLabel: '本轮新上榜',
  previousScore: null,
  category: 'AI',
  eventSummary: 'OpenAI发布新模型并引发讨论。',
  aliases: [signal.title],
  keywords: ['OpenAI', 'GPT-5']
}], {
  generatedAt: '2026-07-27T08:00:00.000Z',
  rawSignalCount: 1,
  signalCount: 1
}, {
  topN: 1,
  minScore: 20,
  requireSeedPlatforms: true,
  seedPlatforms: ['weibo', 'douyin']
});

assert(report.includes('🤖'));
assert(report.includes('OpenAI发布GPT-5新模型'));

console.log('AI分类与播报测试通过');
