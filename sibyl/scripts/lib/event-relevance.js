const { callAIModel } = require('../../../elixir-summarizer/scripts/elixir-summarizer');
const { resolveModelConfig } = require('./model-config');
const { keywordMatchesTitle } = require('./keyword-matcher');
const { text } = require('./locale');

const DEFAULT_CONFIG = {
  enabled: true,
  useAI: true,
  minConfidence: 0.75,
  maxTokens: 1200
};

const ROUTINE_OFFICIAL_PATTERN =
  /版本(更新|上线|前瞻)|维护公告|停机维护|预下载|新版本|新区(域)?开放|新地图|新角色|角色上线|卡池|皮肤(上线|返场)?|限时活动|官方活动|登录福利|签到|礼包|兑换码|测试招募|预约开启|周年庆|联动开启|活动开启|版本直播/iu;
const BREAKOUT_PATTERN =
  /争议|事故|崩溃|宕机|回档|停服|封号|退款|道歉|抵制|投诉|泄露|抄袭|侵权|处罚|被骂|爆火|出圈|刷屏|现象级|二创|玩家自制|纪录/iu;
const FILTERED_NATURES = new Set([
  'official_update',
  'official_campaign',
  'commercial_promotion'
]);

function loadModelConfig(customConfig = {}) {
  // config.ai or SIBYL_AI_* environment variables; null means rule-based fallback.
  return resolveModelConfig(customConfig);
}

function clusterText(cluster) {
  return [
    cluster.canonicalTitle,
    ...(cluster.aliases || []),
    ...(cluster.signals || []).map(signal => signal.title)
  ].filter(Boolean).join('；');
}

function ruleDecision(cluster) {
  const text = clusterText(cluster);
  const routineOfficial = ROUTINE_OFFICIAL_PATTERN.test(text);
  const breakout = BREAKOUT_PATTERN.test(text);
  return {
    eventNature: routineOfficial ? 'official_update' : 'other',
    routineOfficial,
    breakout,
    organicDiscussion: breakout,
    confidence: routineOfficial || breakout ? 0.82 : 0.5,
    reason: routineOfficial
      ? '命中例行版本或官方活动特征'
      : (breakout ? '出现争议、事故或明显破圈特征' : '规则无法确定事件性质'),
    source: 'rule'
  };
}

function buildPrompt(clusters) {
  const items = clusters.map((cluster, index) => ({
    id: `g${index + 1}`,
    title: cluster.canonicalTitle || cluster.mainSignal.title,
    topics: (cluster.aliases || []).slice(0, 12),
    platforms: cluster.platforms || []
  }));
  return `你负责判断游戏热点是否值得进入综合热点播报。只判断事件性质，不生成摘要或建议。

事件性质只能选择：
- official_update：例行版本、维护、角色/地图/卡池/皮肤上线
- official_campaign：官方活动、福利、签到、礼包、预约、测试招募
- commercial_promotion：以宣发、联动或销售转化为核心
- organic_phenomenon：玩家自发形成的独立梗、二创或破圈传播
- controversy_incident：事故、争议、故障、处罚、退款、侵权等
- competitive_event：游戏相关正式比赛或竞赛结果
- creator_player_event：主播、选手或创作者的独立事件
- other：无法归入以上类型

判断原则：
1. 版本、官方活动和商业宣发即使热度较高，默认仍属于routineOfficial。
2. 普通“玩家讨论版本体验”不足以成为独立破圈信号。
3. 只有争议事故、玩家自发二创/梗或明显破圈传播才可标记breakout。
4. 不要因为跨平台出现就自动认定breakout。
5. 无法确认时保守判断，不虚构输入中没有的信息。

返回合法JSON：
{
  "decisions": [
    {
      "id": "g1",
      "eventNature": "official_update|official_campaign|commercial_promotion|organic_phenomenon|controversy_incident|competitive_event|creator_player_event|other",
      "routineOfficial": true,
      "organicDiscussion": false,
      "breakout": false,
      "confidence": 0.9,
      "reason": "简短、具体的判断依据"
    }
  ]
}

待判断事件：
${JSON.stringify(items, null, 2)}

只输出JSON。`;
}

function parseJson(content) {
  const text = String(content || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (innerError) {
      return null;
    }
  }
}

async function classifyWithAI(clusters, config, dependencies = {}) {
  if (!clusters.length) return new Map();
  if (config.useAI === false) return new Map();
  if (dependencies.classifyEvents) {
    const decisions = await dependencies.classifyEvents(clusters);
    return new Map((decisions || []).map(item => [item.id, item]));
  }
  const modelConfig = loadModelConfig(config);
  if (!modelConfig) return new Map();
  const result = await callAIModel(buildPrompt(clusters), modelConfig, 1, {
    maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
    temperature: 0.1
  });
  if (!result.success) return new Map();
  const parsed = parseJson(result.content);
  return new Map((parsed?.decisions || []).map(item => [item.id, item]));
}

function finalDecision(cluster, aiDecision, config) {
  const rule = ruleDecision(cluster);
  const aiConfidence = Number(aiDecision?.confidence) || 0;
  const useAI = aiDecision && aiConfidence >= config.minConfidence;
  const nature = useAI ? String(aiDecision.eventNature || 'other') : rule.eventNature;
  const routineOfficial = rule.routineOfficial ||
    (useAI && (Boolean(aiDecision.routineOfficial) || FILTERED_NATURES.has(nature)));
  const aiBreakout = useAI &&
    Boolean(aiDecision.breakout) &&
    Boolean(aiDecision.organicDiscussion) &&
    (nature === 'organic_phenomenon' || nature === 'controversy_incident');
  const breakout = rule.breakout || aiBreakout;
  const filtered = routineOfficial && !breakout;
  return {
    eventNature: nature,
    routineOfficial,
    organicDiscussion: useAI
      ? Boolean(aiDecision.organicDiscussion)
      : rule.organicDiscussion,
    breakout,
    filtered,
    filterReason: filtered
      ? (useAI ? aiDecision.reason : rule.reason)
      : null,
    overrideReason: routineOfficial && breakout
      ? '例行官方内容形成争议、事故或独立破圈事件'
      : null,
    confidence: useAI ? aiConfidence : rule.confidence,
    source: useAI ? 'ai+rule' : rule.source
  };
}

// English output: each topic may list words that keep its routine items out of the main
// briefing (topics[].briefingExclude), in place of v1.3.20's rule for game updates only.
function applyTopicExcludeWords(clusters, topicSettings) {
  const wordsByTopic = new Map((topicSettings?.categories || []).map(topic => [topic.name, topic.briefingExclude || []]));
  clusters.forEach(cluster => {
    const words = wordsByTopic.get(cluster.category) || [];
    const titles = clusterText(cluster);
    const hit = words.find(word => keywordMatchesTitle(titles, word));
    if (!hit) return;
    const reason = `contains "${hit}", which the topic "${cluster.category}" keeps out of the briefing`;
    cluster.relevance = { eventNature: 'topic_exclude_word', filtered: true, filterReason: reason, source: 'topic-exclude-words' };
    cluster.broadcastFiltered = true;
    cluster.broadcastFilterReason = reason;
  });
  return clusters;
}

async function applyEventRelevanceFilter(clusters, customConfig = {}, dependencies = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  if (config.enabled === false) return clusters;
  if (text().code !== 'zh') return applyTopicExcludeWords(clusters, config.topicSettings);
  const games = clusters.filter(cluster => cluster.category === '游戏');
  const aiDecisions = await classifyWithAI(games, config, dependencies);
  games.forEach((cluster, index) => {
    cluster.relevance = finalDecision(cluster, aiDecisions.get(`g${index + 1}`), config);
    cluster.broadcastFiltered = cluster.relevance.filtered;
    cluster.broadcastFilterReason = cluster.relevance.filterReason;
  });
  return clusters;
}

module.exports = {
  applyEventRelevanceFilter,
  applyTopicExcludeWords,
  buildPrompt,
  ruleDecision
};
