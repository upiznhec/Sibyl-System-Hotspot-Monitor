const path = require('path');

const { callAIModel } = require('../../../elixir-summarizer/scripts/elixir-summarizer');
const { resolveModelConfig } = require('./model-config');
const { rebuildClusterFromSignals } = require('./clusterer');
const { getDataDir, readJson } = require('./snapshot-store');
const { normalizeForCompare } = require('./signals');
const { defaultSeedPlatforms } = require('./source-registry');

const DEFAULT_CONFIG = {
  enabled: true,
  candidateLimit: 36,
  preSummaryCandidateLimit: 12,
  maxMergeBatchSize: 8,
  minConfidence: 0.8,
  maxTokens: 1400
};

const VAGUE_TITLE_PATTERNS = [
  /动态持续升温/,
  /相关动态/,
  /引发关注/,
  /成为焦点/,
  /话题不断/,
  /讨论延续/
];
const ALLOWED_RELATION_TYPES = new Set([
  'same_fact',
  'cause_result',
  'official_response',
  'direct_aftermath',
  'direct_discussion'
]);
const VAGUE_ANCHOR_PATTERNS = [
  /相关(事件|动态|话题)?$/,
  /近期动态$/,
  /热点事件$/,
  /同一(人物|选手|队伍|俱乐部|游戏|品类)/,
  /^(人物|选手|队伍|俱乐部|游戏|赛事)动态$/
];
const GENERIC_EVIDENCE_PATTERN =
  /关键词匹配|品类一致|主体一致|名称相同|同一人物|同一选手|同一队伍|同一俱乐部|同一游戏|都是.{0,8}(动态|话题)/;
const ANCHOR_STOP_BIGRAMS = new Set([
  '事件', '话题', '热点', '引发', '关注', '相关', '赛后', '比赛', '成为',
  '表示', '网友', '今日', '目前', '进行', '最终', '同时', '本场'
]);
const GENERIC_ANCHOR_PHRASES = new Set([
  '世界杯', '大满贯', '淘汰赛', '比赛结果', '赛后动态', '引发关注', '成为热点'
]);
const DISCIPLINE_PATTERNS = [
  ['mixed_doubles', /混双|混合双打/],
  ['mens_singles', /男单|男子单打/],
  ['womens_singles', /女单|女子单打/],
  ['mens_doubles', /男双|男子双打/],
  ['womens_doubles', /女双|女子双打/]
];
const STAGE_PATTERNS = [
  ['r16', /1\/8决赛|八分之一决赛|止步16强|晋级16强|16强|无缘八强|无人晋级八强|未进八强/],
  ['qf', /1\/4决赛|四分之一决赛|晋级八强|止步八强|八强/],
  ['sf', /半决赛|晋级四强|止步四强|四强/],
  ['final', /决赛|夺冠|亚军/]
];
const COMPETITION_PATTERNS = [
  ['wtt_us_smash', /WTT.{0,8}美国大满贯|美国大满贯/i],
  ['world_cup', /世界杯/],
  ['champions_league', /欧冠/],
  ['nba', /\bNBA\b/i]
];

function loadModelConfig(customConfig = {}) {
  // config.ai or SIBYL_AI_* environment variables; null means rule-based fallback.
  return resolveModelConfig(customConfig);
}

function alertSummaryMap() {
  const cache = readJson(path.join(getDataDir(), 'alert-summaries.json'), {});
  const result = new Map();
  Object.values(cache || {}).forEach(item => {
    const title = normalizeForCompare(item?.title || '');
    const summary = String(item?.summary || '').replace(/\s+/g, ' ').trim();
    if (title && summary && summary !== '暂无摘要') result.set(title, summary);
  });
  return result;
}

function hasSeedPlatform(cluster, seedPlatforms) {
  const seeds = new Set(seedPlatforms);
  return (cluster.signals || []).some(signal => seeds.has(signal.platform));
}

function selectCandidates(clusters, config) {
  const limit = config.candidateLimit || DEFAULT_CONFIG.candidateLimit;
  const seedPlatforms = config.seedPlatforms || defaultSeedPlatforms();
  const seeds = clusters.filter(cluster => hasSeedPlatform(cluster, seedPlatforms));
  const selected = [];
  const seen = new Set();

  [...seeds, ...clusters].forEach(cluster => {
    if (selected.length >= limit || seen.has(cluster.topicId)) return;
    selected.push(cluster);
    seen.add(cluster.topicId);
  });
  return selected;
}

function selectPreSummaryCandidates(clusters, config = {}) {
  const candidates = selectCandidates(clusters, config);
  const entityCounts = new Map();
  candidates.forEach(cluster => {
    new Set(cluster.entityTokens || []).forEach(entity => {
      entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
    });
  });
  const limit = Math.max(2, Number(config.preSummaryCandidateLimit) || DEFAULT_CONFIG.preSummaryCandidateLimit);
  return candidates
    .filter(cluster => (cluster.entityTokens || []).some(entity => (entityCounts.get(entity) || 0) > 1))
    .slice(0, limit);
}

function anchorBigrams(cluster) {
  const text = [
    cluster.canonicalTitle,
    cluster.eventSummary,
    ...(cluster.aliases || [])
  ].filter(Boolean).join('');
  const chars = text.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '').toLowerCase();
  const grams = new Set();
  for (let index = 0; index < chars.length - 1; index++) {
    const gram = chars.slice(index, index + 2);
    if (!ANCHOR_STOP_BIGRAMS.has(gram)) grams.add(gram);
  }
  return grams;
}

function clusterText(cluster) {
  return [
    cluster.canonicalTitle,
    cluster.eventSummary,
    ...(cluster.aliases || [])
  ].filter(Boolean).join(' ');
}

function firstPattern(text, patterns) {
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function anchorPhrases(cluster) {
  const phrases = new Set(cluster.entityTokens || []);
  for (const chunk of clusterText(cluster).replace(/\s+/g, '').match(/[\u4e00-\u9fa5]{3,}/g) || []) {
    for (let size = 3; size <= Math.min(6, chunk.length); size++) {
      for (let index = 0; index <= chunk.length - size; index++) {
        const phrase = chunk.slice(index, index + size);
        if (!GENERIC_ANCHOR_PHRASES.has(phrase)) phrases.add(phrase);
      }
    }
  }
  return [...phrases].slice(0, 180);
}

function buildEventFingerprint(cluster) {
  const text = clusterText(cluster);
  return {
    competition: firstPattern(text, COMPETITION_PATTERNS),
    stage: firstPattern(text, STAGE_PATTERNS),
    discipline: firstPattern(text, DISCIPLINE_PATTERNS),
    anchors: anchorPhrases(cluster).slice(0, 24)
  };
}

function fingerprintConflict(left, right) {
  const a = buildEventFingerprint(left);
  const b = buildEventFingerprint(right);
  return Boolean(a.discipline && b.discipline && a.discipline !== b.discipline);
}

function strongFingerprintMatch(left, right) {
  if (left.category && right.category && left.category !== right.category) return null;
  if (fingerprintConflict(left, right)) return null;
  const a = buildEventFingerprint(left);
  const b = buildEventFingerprint(right);
  const rightAnchors = new Set(anchorPhrases(right));
  const anchor = anchorPhrases(left)
    .filter(value => value.length >= 3 && rightAnchors.has(value))
    .sort((x, y) => y.length - x.length)[0];
  const sharedEntity = (left.entityTokens || [])
    .find(entity => (right.entityTokens || []).includes(entity));
  const sameCompetition = a.competition && a.competition === b.competition;
  const sameStage = !a.stage || !b.stage || a.stage === b.stage;
  if (sameCompetition && sameStage && sharedEntity) {
    return anchor || sharedEntity || a.competition;
  }
  if (anchor && /葡萄牙|克罗地亚/.test(anchor)) return anchor;
  return null;
}

function likelyRelated(left, right) {
  if (left.category && right.category && left.category !== right.category) return false;
  if (fingerprintConflict(left, right)) return false;
  if (strongFingerprintMatch(left, right)) return true;
  const leftEntities = new Set(left.entityTokens || []);
  if ((right.entityTokens || []).some(entity => leftEntities.has(entity))) return true;
  if (!left.eventSummary || !right.eventSummary) return false;
  const leftGrams = anchorBigrams(left);
  let overlap = 0;
  for (const gram of anchorBigrams(right)) {
    if (leftGrams.has(gram)) overlap++;
  }
  return overlap >= 5;
}

function buildCandidateBatches(candidates, config = {}) {
  const maxBatchSize = Math.max(2, Number(config.maxMergeBatchSize) || 8);
  const parent = candidates.map((_, index) => index);
  const root = index => {
    if (parent[index] !== index) parent[index] = root(parent[index]);
    return parent[index];
  };
  const join = (left, right) => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  candidates.forEach((left, leftIndex) => {
    candidates.slice(leftIndex + 1).forEach((right, offset) => {
      if (likelyRelated(left, right)) join(leftIndex, leftIndex + offset + 1);
    });
  });
  const components = new Map();
  candidates.forEach((candidate, index) => {
    const key = root(index);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(candidate);
  });
  return [...components.values()]
    .filter(component => component.length > 1)
    .flatMap(component => {
      const batches = [];
      for (let index = 0; index < component.length; index += maxBatchSize) {
        const batch = component.slice(index, index + maxBatchSize);
        if (batch.length > 1) batches.push(batch);
      }
      return batches;
    });
}

function buildPrompt(candidates, summaries) {
  const items = candidates.map((cluster, index) => {
    const topics = (cluster.signals || []).map(signal =>
      `${signal.platformLabel || signal.platform}：${signal.title}`
    );
    const knownSummaries = [
      cluster.eventSummary,
      ...(cluster.aliases || [])
      .map(title => summaries.get(normalizeForCompare(title)))
    ]
      .filter(Boolean)
      .filter((summary, position, all) => all.indexOf(summary) === position)
      .slice(0, 3);
    return {
      id: `e${index + 1}`,
      category: cluster.category,
      eventFingerprint: buildEventFingerprint(cluster),
      topics,
      summaries: knownSummaries
    };
  });

  return `你负责把多平台热搜整理成“热点事件线”。不要使用固定的体育、电竞或游戏字段模板，只判断不同话题能否组成同一段具体、连贯、没有逻辑跳跃的事件叙述。

合并标准：
1. 同一事实的不同表述应合并。
2. 同一时间线上的直接前因、结果、回应、赛后/上线后动态和衍生讨论可以合并。
3. 例如“哈兰德助挪威晋级”和“哈兰德赛后在纽约逛街”可以合并，因为后者明确处于同一场比赛的赛后时间线。
4. 仅出现同一个人物、队伍或游戏名不能合并。
5. 不同比赛、不同版本、不同事故，或产生新的正式处罚、转会、伤病结论等独立结果时应拆分。
6. 无法确认时保持拆分，不要为了减少条目强行合并。
7. 不同品类不得合并。
8. 必须指出一个具体的共同事件锚点。人物、队伍、俱乐部、游戏或品类名称本身不是事件锚点。
9. 每个成员都必须说明它与共同事件锚点的直接关系；不能只写“关键词匹配、品类一致、同一主体”。
10. 职业决定与无明确关联的个人活动、比赛纪录与无明确关联的机制讨论等，仅主体相同时应拆分。这些是边界示例，不是固定品类枚举。

关系类型只能选择：
- same_fact：同一事实的不同表达
- cause_result：明确的前因与结果
- official_response：事件与针对该事件的正式回应
- direct_aftermath：明确属于该事件后的直接动态
- direct_discussion：明确针对同一事件或同一版本的直接讨论

标题要求：
- 只根据输入话题和已有摘要生成，不补充外部事实。
- 使用“核心事实 + 最具代表性的衍生事实”。
- 标题必须具体描述事件，建议12至32个汉字。
- 可以写“哈兰德助挪威晋级，赛后纽约逛街成为热点”。
- 禁止使用“赛后动态持续升温、相关动态、引发关注、成为焦点、话题不断、讨论延续”等空泛表达。

请返回需要合并的组；如果某个候选本身已经包含多个平台话题词，也可以单独为它生成更完整的事件标题。单话题事件不需要改标题。JSON格式：
{
  "groups": [
    {
      "memberIds": ["e1", "e2"],
      "confidence": 0.9,
      "sharedEventAnchor": "具体到比赛、官宣、版本或争议的共同事件",
      "relationType": "same_fact|cause_result|official_response|direct_aftermath|direct_discussion",
      "memberEvidence": [
        {"memberId": "e1", "evidence": "该成员与共同事件的具体关系"},
        {"memberId": "e2", "evidence": "该成员与共同事件的具体关系"}
      ],
      "title": "具体事件标题",
      "reason": "一句话说明为什么属于同一事件线"
    }
  ],
  "titles": [
    {
      "memberId": "e3",
      "confidence": 0.9,
      "title": "覆盖该事件多个话题角度的具体标题"
    }
  ]
}

候选事件：
${JSON.stringify(items, null, 2)}

只输出合法JSON。`;
}

function parseJson(content) {
  const text = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function cleanTitle(title) {
  const cleaned = String(title || '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^事件标题[:：]\s*/, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 44);
  if (cleaned.length < 6) return '';
  if (VAGUE_TITLE_PATTERNS.some(pattern => pattern.test(cleaned))) return '';
  return cleaned;
}

function fallbackTitle(clusters) {
  return clusters
    .flatMap(cluster => cluster.aliases || [cluster.mainSignal.title])
    .filter(Boolean)
    .sort((a, b) => {
      const aFit = a.length >= 10 && a.length <= 32 ? 1 : 0;
      const bFit = b.length >= 10 && b.length <= 32 ? 1 : 0;
      return bFit - aFit || b.length - a.length;
    })[0];
}

async function requestGroups(candidates, config, dependencies = {}) {
  if (dependencies.decideGroups) {
    const result = await dependencies.decideGroups(candidates);
    return Array.isArray(result) ? { groups: result, titles: [] } : result;
  }
  const modelConfig = loadModelConfig(config);
  if (!modelConfig) return { groups: [], titles: [] };

  const prompt = buildPrompt(candidates, alertSummaryMap());
  const result = await callAIModel(prompt, modelConfig, 1, {
    maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
    temperature: 0.1
  });
  if (!result.success) return { groups: [], titles: [] };
  const parsed = parseJson(result.content);
  return {
    groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
    titles: Array.isArray(parsed?.titles) ? parsed.titles : []
  };
}

function categorySet(clusters) {
  return new Set(clusters.map(cluster => cluster.category).filter(Boolean));
}

function cleanAnchor(anchor) {
  const value = String(anchor || '').replace(/\s+/g, '').trim().slice(0, 60);
  if (value.length < 6) return '';
  if (VAGUE_ANCHOR_PATTERNS.some(pattern => pattern.test(value))) return '';
  return value;
}

function validMemberEvidence(group, memberIds) {
  const entries = Array.isArray(group?.memberEvidence) ? group.memberEvidence : [];
  const byId = new Map(entries.map(entry => [
    String(entry?.memberId || ''),
    String(entry?.evidence || '').replace(/\s+/g, '').trim()
  ]));
  return memberIds.every(id => {
    const evidence = byId.get(id) || '';
    return evidence.length >= 8 && !GENERIC_EVIDENCE_PATTERN.test(evidence);
  });
}

function validGroup(group, byId, minConfidence) {
  const memberIds = [...new Set(Array.isArray(group?.memberIds) ? group.memberIds : [])];
  const members = memberIds.map(id => byId.get(id)).filter(Boolean);
  if (members.length < 2) return null;
  if (Number(group.confidence) < minConfidence) return null;
  if (categorySet(members).size > 1) return null;
  const sharedEventAnchor = cleanAnchor(group.sharedEventAnchor);
  const relationType = String(group.relationType || '').trim();
  const reason = String(group.reason || '').trim();
  if (!sharedEventAnchor) return null;
  if (!ALLOWED_RELATION_TYPES.has(relationType)) return null;
  if (!validMemberEvidence(group, memberIds)) return null;
  if (!reason || GENERIC_EVIDENCE_PATTERN.test(reason)) return null;
  return {
    memberIds,
    members,
    confidence: Number(group.confidence),
    sharedEventAnchor,
    relationType,
    memberEvidence: group.memberEvidence,
    title: cleanTitle(group.title) || fallbackTitle(members),
    reason
  };
}

function find(parent, value) {
  if (parent.get(value) !== value) {
    parent.set(value, find(parent, parent.get(value)));
  }
  return parent.get(value);
}

function union(parent, left, right) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
}

async function applySemanticEventMerge(clusters, previousState = {}, customConfig = {}, dependencies = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  if (config.enabled === false || clusters.length < 1) return clusters;

  const candidates = selectCandidates(clusters, config);
  if (candidates.length < 1) return clusters;
  const batches = buildCandidateBatches(candidates, config);
  if (!batches.length) return clusters;
  const validGroups = [];
  const retitles = new Map();
  for (const batch of batches) {
    const byId = new Map(batch.map((cluster, index) => [`e${index + 1}`, cluster]));
    const decisions = await requestGroups(batch, config, dependencies);
    validGroups.push(...(decisions.groups || [])
      .map(group => validGroup(group, byId, config.minConfidence))
      .filter(Boolean));
    (decisions.titles || []).forEach(item => {
      const cluster = byId.get(item?.memberId);
      const title = cleanTitle(item?.title);
      if (!cluster || (cluster.aliases || []).length < 2) return;
      if (Number(item.confidence) < config.minConfidence || !title) return;
      retitles.set(cluster.topicId, title);
    });
  }
  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const anchor = strongFingerprintMatch(candidates[left], candidates[right]);
      if (!anchor) continue;
      validGroups.push({
        memberIds: [],
        members: [candidates[left], candidates[right]],
        confidence: 0.9,
        sharedEventAnchor: anchor,
        relationType: 'same_fact',
        memberEvidence: [],
        title: fallbackTitle([candidates[left], candidates[right]]),
        reason: '赛事、项目与事实锚点形成同一事件指纹'
      });
    }
  }
  if (!validGroups.length && !retitles.size) return clusters;

  const parent = new Map(candidates.map(cluster => [cluster.topicId, cluster.topicId]));
  validGroups.forEach(group => {
    const ids = group.members.map(cluster => cluster.topicId);
    ids.slice(1).forEach(id => union(parent, ids[0], id));
  });

  const components = new Map();
  candidates.forEach(cluster => {
    const root = find(parent, cluster.topicId);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(cluster);
  });

  const consumed = new Set();
  const merged = [];
  for (const component of components.values()) {
    if (component.length < 2) continue;
    component.forEach(cluster => consumed.add(cluster.topicId));
    const matchingGroups = validGroups.filter(group =>
      group.members.some(member => component.includes(member))
    ).sort((a, b) => b.confidence - a.confidence);
    const primaryGroup = matchingGroups[0];
    merged.push(rebuildClusterFromSignals(
      component.flatMap(cluster => cluster.signals || []),
      previousState,
      {
        canonicalTitle: primaryGroup?.title || fallbackTitle(component),
        eventMerge: {
          memberClusterIds: component.map(cluster => cluster.topicId),
          memberSummaries: component
            .map(cluster => ({
              topicId: cluster.topicId,
              title: cluster.canonicalTitle || cluster.mainSignal?.title || '',
              summary: cluster.eventSummary || ''
            }))
            .filter(item => item.summary),
          confidence: primaryGroup?.confidence || null,
          sharedEventAnchor: primaryGroup?.sharedEventAnchor || '',
          relationType: primaryGroup?.relationType || '',
          memberEvidence: primaryGroup?.memberEvidence || [],
          reason: primaryGroup?.reason || '',
          memberCount: component.length
        }
      }
    ));
  }

  const untouched = clusters
    .filter(cluster => !consumed.has(cluster.topicId))
    .map(cluster => {
      const title = retitles.get(cluster.topicId);
      if (!title) return cluster;
      return rebuildClusterFromSignals(cluster.signals || [], previousState, {
        canonicalTitle: title,
        eventMerge: cluster.eventMerge || {
          memberClusterIds: [cluster.topicId],
          confidence: null,
          reason: '多话题事件标题归一',
          memberCount: 1
        }
      });
    });

  return [
    ...untouched,
    ...merged
  ].sort((a, b) => b.score - a.score);
}

module.exports = {
  applySemanticEventMerge,
  buildCandidateBatches,
  buildEventFingerprint,
  buildPrompt,
  cleanTitle,
  parseJson,
  selectCandidates,
  selectPreSummaryCandidates,
  strongFingerprintMatch
};
