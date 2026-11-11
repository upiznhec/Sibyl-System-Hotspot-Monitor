const path = require('path');

const { callAIModel } = require('../../../elixir-summarizer/scripts/elixir-summarizer');
const { resolveModelConfig } = require('./model-config');
const { rebuildClusterFromSignals } = require('./clusterer');
const { getDataDir, readJson } = require('./snapshot-store');
const { normalizeForCompare } = require('./signals');
const { isNoSummary, text } = require('./locale');
const { contentWords, isHashtag } = require('./english-words');
const { defaultSeedPlatforms } = require('./source-registry');

const DEFAULT_CONFIG = {
  enabled: true,
  candidateLimit: 36,
  preSummaryCandidateLimit: 12,
  maxMergeBatchSize: 8,
  minConfidence: 0.8,
  maxTokens: 1400
};

const ALLOWED_RELATION_TYPES = new Set([
  'same_fact',
  'cause_result',
  'official_response',
  'direct_aftermath',
  'direct_discussion'
]);

// Patterns and wording for merging, translated from v1.3.20 (lib/lang/en.js).
function rules() {
  return text().merge;
}

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
    if (title && summary && !isNoSummary(summary)) result.set(title, summary);
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

// The content words of the event's title, summary and search terms.
function anchorWords(cluster) {
  return new Set([cluster.canonicalTitle, cluster.eventSummary, ...(cluster.aliases || [])]
    .filter(Boolean)
    .flatMap(contentWords));
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
  // Pairs of neighbouring words, such as "kirk cousins", from the titles.
  [cluster.canonicalTitle, ...(cluster.aliases || [])].filter(Boolean).forEach(title => {
    const words = contentWords(title);
    for (let index = 0; index < words.length - 1; index++) phrases.add(`${words[index]} ${words[index + 1]}`);
  });
  return [...phrases].slice(0, 180);
}

function buildEventFingerprint(cluster) {
  const text = clusterText(cluster);
  return {
    competition: firstPattern(text, rules().competitions),
    stage: firstPattern(text, rules().stages),
    discipline: firstPattern(text, rules().disciplines),
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
  return null;
}

function likelyRelated(left, right) {
  if (left.category && right.category && left.category !== right.category) return false;
  if (fingerprintConflict(left, right)) return false;
  if (strongFingerprintMatch(left, right)) return true;
  const leftEntities = new Set(left.entityTokens || []);
  if ((right.entityTokens || []).some(entity => leftEntities.has(entity))) return true;
  if (!left.eventSummary || !right.eventSummary) return false;
  // Summaries that share at least three content words.
  const leftWords = anchorWords(left);
  return [...anchorWords(right)].filter(word => leftWords.has(word)).length >= 3;
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

function buildEnglishPrompt(items) {
  return `You group trending search terms and hashtags from several sources into event threads. Do not use fixed templates for sports, games or any other category; only decide whether different items form one specific, continuous story without gaps in logic.

Merge rules:
1. Different wordings of the same fact are merged.
2. Direct causes, results, responses, aftermath and discussion on the same timeline may be merged.
3. For example, "Player A scores twice as Team B advances" and "Player A goes sightseeing in New York after the game" can be merged, because the second is clearly part of the same game's aftermath.
4. Sharing only the same person, team, brand or game is not enough to merge.
5. Split different games, different releases, different incidents, and new independent outcomes such as an official penalty, a trade or an injury diagnosis.
6. When unsure, keep items apart; do not merge just to make the list shorter.
7. Never merge items from different categories.
8. Name one specific shared event anchor. A person, team, club, brand, game or category name on its own is not an event anchor.
9. For every member, state its direct relation to the shared anchor; "keyword match", "same category" or "same person" is not enough.
10. Split a career decision from an unrelated personal activity, or a record from an unrelated discussion of rules, when they only share a subject. These are examples of the boundary, not a fixed list of categories.

Relation types (choose one):
- same_fact: different wordings of the same fact
- cause_result: a clear cause and its result
- official_response: an event and an official response to it
- direct_aftermath: what happened directly after the event
- direct_discussion: discussion clearly about the same event or release

Title rules:
- Use only the input items and known summaries; add no outside facts.
- Write the core fact plus the most telling follow-up.
- Be specific, in about 6 to 14 words.
- For example: "Player A sends Team B through, then his New York walk trends".
- Do not use vague phrases such as "continues to trend", "sparks discussion", "draws attention" or "in the spotlight".

Return the groups to merge. If one candidate already covers several search terms, you may give it a more complete title; single-term events need no new title. JSON format:
{
  "groups": [
    {
      "memberIds": ["e1", "e2"],
      "confidence": 0.9,
      "sharedEventAnchor": "the specific shared event: a game, announcement, release or controversy",
      "relationType": "same_fact|cause_result|official_response|direct_aftermath|direct_discussion",
      "memberEvidence": [
        {"memberId": "e1", "evidence": "how this member relates to the shared event"},
        {"memberId": "e2", "evidence": "how this member relates to the shared event"}
      ],
      "title": "specific event title",
      "reason": "one sentence on why these belong to one event thread"
    }
  ],
  "titles": [
    {
      "memberId": "e3",
      "confidence": 0.9,
      "title": "a specific title that covers the event's search terms"
    }
  ]
}

Candidates:
${JSON.stringify(items, null, 2)}

Reply with valid JSON only.`;
}

function buildPrompt(candidates, summaries) {
  const items = candidates.map((cluster, index) => {
    const topics = (cluster.signals || []).map(signal =>
      `${signal.platformLabel || signal.platform}: ${signal.title}`
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

  return buildEnglishPrompt(items);
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

// Titles keep their spaces; 10 to 100 characters, at least two words.
function cleanEnglishTitle(title) {
  const cleaned = String(title || '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^(event )?title:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  if (cleaned.length < 10 || cleaned.split(' ').length < 2) return '';
  if (rules().vagueTitles.some(pattern => pattern.test(cleaned))) return '';
  return cleaned;
}

function cleanTitle(title) {
  return cleanEnglishTitle(title);
}

// A title in words of a readable length, else the longest.
function fallbackTitle(clusters) {
  return clusters
    .flatMap(cluster => cluster.aliases || [cluster.mainSignal.title])
    .filter(Boolean)
    .sort((a, b) => {
      const fit = title => (!isHashtag(title) && title.length >= 15 && title.length <= 90 ? 1 : 0);
      return fit(b) - fit(a) || b.length - a.length;
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
  const value = String(anchor || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (value.length < 8) return '';
  return rules().vagueAnchors.some(pattern => pattern.test(value)) ? '' : value;
}

function validMemberEvidence(group, memberIds) {
  const entries = Array.isArray(group?.memberEvidence) ? group.memberEvidence : [];
  const byId = new Map(entries.map(entry => [
    String(entry?.memberId || ''),
    String(entry?.evidence || '').replace(/\s+/g, '').trim()
  ]));
  return memberIds.every(id => {
    const evidence = byId.get(id) || '';
    return evidence.length >= rules().minEvidenceLength && !rules().genericEvidence.test(evidence);
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
  if (!reason || rules().genericEvidence.test(reason)) return null;
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
        reason: rules().fingerprintReason
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
          reason: rules().retitleReason,
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
