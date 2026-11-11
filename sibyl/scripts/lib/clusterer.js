const { formatSignalBrief, normalizeForCompare, stableHash } = require('./signals');
const { text } = require('./locale');
const english = require('./english-words');

// v1.3.20's rules below (bigrams, Chinese stop words and patterns) apply to Chinese output only;
// English titles are grouped by words (lib/english-words.js, lib/lang/en.js).
function isEnglish() {
  return text().code !== 'zh';
}
const {
  sourceHeatReference,
  sourceLabel,
  sourceTypeBoost,
  sourceTypeWeight,
  sourceWeight
} = require('./source-registry');

const STOP_WORDS = new Set([
  '热搜', '热榜', '话题', '回应', '官方', '最新', '今天', '今日', '昨日',
  '怎么回事', '为什么', '排名', '讨论', '网友', '冲上', '登上', '引热议'
]);

const GENERIC_KEYWORDS = new Set([
  '游戏', '电竞', '体育', '足球', '篮球', 'nba', 'cba', 'lpl', 'lck', 'kpl',
  '英雄联盟', '王者荣耀', '世界杯', '欧冠', '英超', 'msi',
  'ai', '人工智能', '生成式ai', 'aigc', '大模型', '智能体', '热搜', '热榜'
]);

const EVENT_CONCEPT_PATTERNS = [
  { concept: 'hat_trick', pattern: /帽子戏法|戴帽|三进球/ },
  { concept: 'goal', pattern: /世界波|进球|破门|绝杀|任意球|双响/ },
  { concept: 'foul_injury', pattern: /踩小腿|踩踏|犯规|红牌|黄牌|受伤|伤退|拉伤|撞伤|伤病/ },
  { concept: 'fan_support', pattern: /球迷|双向奔赴|加油|应援/ },
  { concept: 'win_loss', pattern: /击败|战胜|不敌|淘汰|锁定|晋级|出线|夺冠|夺金|取胜|输给|获胜|翻盘/ },
  { concept: 'award', pattern: /当选|最佳|mvp|MVP|全场最佳/ },
  { concept: 'record', pattern: /射手王|打破.{0,6}纪录|刷新.{0,6}纪录|创下.{0,6}纪录|队史|加冕|登顶.{0,8}榜/ },
  { concept: 'response', pattern: /回应|道歉|辟谣|否认|声明|发文|怒喷|吐槽|炮轰/ },
  { concept: 'mechanism', pattern: /机制|elo|ELO|排位|匹配/ },
  { concept: 'lineup_schedule', pattern: /训练赛|参赛|名单|阵容|赛程|开赛|首发|分组|抽签/ },
  { concept: 'stats', pattern: /数据|统计|胜率|场次|年龄|排名|榜单/ },
  { concept: 'transfer_trade', pattern: /交易|签约|续约|加盟|离队|转会|换来|换走|选秀|签位/ },
  { concept: 'game_update', pattern: /上线|更新|削弱|加强|改动|版本|皮肤|补丁/ },
  { concept: 'appearance', pattern: /合照|见面会|献唱|直播|采访|亮相/ }
];

function scoreSignal(signal) {
  const platformWeight = sourceWeight(signal.platform);
  const listTypeWeight = sourceTypeWeight(signal.sourceType);
  const rank = signal.rank || 999;
  const rankScore = Math.max(0, 36 - Math.min(rank, 35)) * 1.25;
  // v1.3.20 reaches the 36-point cap near 1,000,000 heat (Weibo, Douyin). Other sources count
  // in other units, so their adapter says which heat should reach the cap.
  const heatReference = sourceHeatReference(signal.platform, signal.sourceType);
  const heatScore = heatReference
    ? Math.min(36, Math.log10((signal.heat || 0) + 10) * (36 / Math.log10(heatReference + 10)))
    : Math.min(36, Math.log10((signal.heat || 0) + 10) * 6);
  const keywordBoost = Math.min(12, (signal.matchedKeywords || []).length * 2.5);
  const boardBoost = sourceTypeBoost(signal.sourceType);
  return Math.round((rankScore + heatScore + keywordBoost + boardBoost) * platformWeight * listTypeWeight);
}

function chineseBigrams(text) {
  const chars = text.replace(/[^\u4e00-\u9fa5]/g, '');
  const grams = [];
  for (let i = 0; i < chars.length - 1; i++) {
    grams.push(chars.slice(i, i + 2));
  }
  return grams;
}

// English: the event's own words, i.e. title words without stop words and without the topic
// keywords the item matched (those say which topic, not which event).
function englishEventWords(signal) {
  const topicWords = english.keywordWords(signal.matchedKeywords || []);
  return [...new Set(english.contentWords(signal.title).filter(word => !topicWords.has(word)))].slice(0, 40);
}

function extractTokens(signal) {
  if (isEnglish()) return englishEventWords(signal);
  const normalized = normalizeForCompare(signal.title);
  const tokens = new Set();

  (signal.matchedKeywords || []).forEach(keyword => {
    const word = normalizeForCompare(keyword);
    if (word && !STOP_WORDS.has(word)) tokens.add(word);
  });

  const englishTokens = normalized.match(/[a-z0-9][a-z0-9_.-]{1,}/gi) || [];
  englishTokens.forEach(token => {
    if (!STOP_WORDS.has(token)) tokens.add(token);
  });

  chineseBigrams(normalized).forEach(token => {
    if (!STOP_WORDS.has(token)) tokens.add(token);
  });

  return [...tokens].filter(token => token.length >= 2).slice(0, 40);
}

function extractEntityTokens(signal) {
  if (isEnglish()) return englishEventWords(signal).slice(0, 20);
  const entities = new Set();
  (signal.matchedKeywords || []).forEach(keyword => {
    const word = normalizeForCompare(keyword);
    if (word && !STOP_WORDS.has(word) && !GENERIC_KEYWORDS.has(word)) {
      entities.add(word);
    }
  });

  const englishTokens = normalizeForCompare(signal.title).match(/[a-z0-9][a-z0-9_.-]{1,}/gi) || [];
  englishTokens.forEach(token => {
    const word = normalizeForCompare(token);
    if (word && !GENERIC_KEYWORDS.has(word)) entities.add(word);
  });

  return [...entities].slice(0, 20);
}

function extractEventConcepts(title = '') {
  const concepts = new Set();
  (isEnglish() ? text().eventConcepts : EVENT_CONCEPT_PATTERNS).forEach(({ concept, pattern }) => {
    if (pattern.test(title)) concepts.add(concept);
  });
  return [...concepts];
}

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function sharedStrongKeyword(signal, cluster) {
  const signalKeywords = new Set((signal.matchedKeywords || []).map(normalizeForCompare).filter(Boolean));
  const clusterKeywords = new Set((cluster.keywords || []).map(normalizeForCompare).filter(Boolean));
  for (const keyword of signalKeywords) {
    if (!clusterKeywords.has(keyword)) continue;
    if (GENERIC_KEYWORDS.has(keyword)) continue;
    if (/^[a-z0-9_.-]{3,}$/i.test(keyword)) return keyword;
    if (/^[\u4e00-\u9fa5]{2,}$/.test(keyword)) return keyword;
  }
  return null;
}

function longestCommonSubstringRatio(a, b) {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let best = 0;

  for (let i = 0; i < shorter.length; i++) {
    for (let j = i + 2; j <= shorter.length; j++) {
      const piece = shorter.slice(i, j);
      if (piece.length <= best) continue;
      if (longer.includes(piece)) best = piece.length;
    }
  }

  return best / Math.max(1, Math.min(a.length, b.length));
}

// How much two English titles share: 1 for the same title, 0.9 when a hashtag joins words of
// the other title, else the share of the shorter title's event words found in the other.
function englishTitleOverlap(signal, existing, topicWords) {
  if (signal.normalizedTitle && signal.normalizedTitle === existing.normalizedTitle) return 1;
  if (english.hashtagJoinsWords(signal.title, existing.title, topicWords) ||
      english.hashtagJoinsWords(existing.title, signal.title, topicWords)) {
    return 0.9;
  }
  const own = signal.tokens || [];
  const other = existing.tokens || [];
  if (!own.length || !other.length) return 0;
  return own.filter(word => other.includes(word)).length / Math.min(own.length, other.length);
}

function englishSimilarity(signal, cluster) {
  const topicWords = english.keywordWords([...(signal.matchedKeywords || []), ...(cluster.keywords || [])]);
  const titleScore = Math.max(...cluster.signals.map(existing => englishTitleOverlap(signal, existing, topicWords)));
  const tokenScore = jaccard(signal.tokens, cluster.tokens);
  const baseScore = titleScore * 0.6 + tokenScore * 0.4;
  const bothHaveConcepts = (signal.eventConcepts || []).length > 0 && (cluster.eventConcepts || []).length > 0;
  // Same people or brand, different kinds of event (a trade and an injury): kept apart, as in v1.3.20.
  if (bothHaveConcepts && jaccard(signal.eventConcepts, cluster.eventConcepts) === 0 && titleScore < 0.55) {
    return Math.min(baseScore, 0.25);
  }
  return baseScore;
}

function similarity(signal, cluster) {
  if (isEnglish()) return englishSimilarity(signal, cluster);
  const tokenScore = jaccard(signal.tokens, cluster.tokens);
  const titleScore = Math.max(...cluster.signals.map(existing =>
    longestCommonSubstringRatio(signal.normalizedTitle, existing.normalizedTitle)
  ));
  const keywordScore = jaccard(signal.matchedKeywords || [], cluster.keywords || []);
  const entityScore = jaccard(signal.entityTokens || [], cluster.entityTokens || []);
  const conceptScore = jaccard(signal.eventConcepts || [], cluster.eventConcepts || []);
  const baseScore = tokenScore * 0.45 + titleScore * 0.45 + keywordScore * 0.1;
  const strongKeyword = sharedStrongKeyword(signal, cluster);
  const signalHasConcept = (signal.eventConcepts || []).length > 0;
  const clusterHasConcept = (cluster.eventConcepts || []).length > 0;
  const hasEntityOverlap = Boolean(strongKeyword) || entityScore > 0;
  const hasConceptConflict = hasEntityOverlap &&
    signalHasConcept &&
    clusterHasConcept &&
    conceptScore === 0;
  const hasAsymmetricConcept = hasEntityOverlap &&
    signalHasConcept !== clusterHasConcept;

  if (hasConceptConflict && titleScore < 0.55) {
    return Math.min(baseScore, 0.25);
  }

  if (hasAsymmetricConcept && titleScore < 0.45 && tokenScore < 0.25) {
    return Math.min(baseScore, 0.3);
  }

  if (hasEntityOverlap && conceptScore > 0 && (titleScore >= 0.08 || tokenScore >= 0.05)) {
    return Math.max(baseScore, 0.62);
  }

  if (strongKeyword && !signalHasConcept && !clusterHasConcept && (titleScore >= 0.55 || tokenScore >= 0.28)) {
    return Math.max(baseScore, 0.58);
  }

  return baseScore;
}

function summarizePlatforms(signals) {
  return signals
    .slice()
    .sort((a, b) => scoreSignal(b) - scoreSignal(a))
    .map(formatSignalBrief);
}

function dominantCategory(signals) {
  const scores = {};
  for (const signal of signals) {
    if (!signal.category) continue;
    scores[signal.category] = (scores[signal.category] || 0) + scoreSignal(signal);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || null;
}

function statusFrom(prev, score, firstSeenAt) {
  if (!prev) return 'new';
  const previousScore = prev.score || 0;
  const growthRate = previousScore ? (score - previousScore) / previousScore : 0;
  const ageHours = (Date.now() - new Date(firstSeenAt).getTime()) / 3600000;

  if (growthRate >= 0.35) return 'rising';
  if (growthRate <= -0.28) return 'cooling';
  if (ageHours >= 12) return 'holding';
  return 'steady';
}

function statusLabel(status) {
  return text().statusLabels[status] || status;
}

function platformNames(platforms = []) {
  return platforms.map(sourceLabel).join(text().nameJoin);
}

function buildBroadcastReasons(cluster, prev) {
  const wording = text().reasons;
  if (!prev) return [wording.first];

  const reasons = [];
  const growthPercent = cluster.growthRate === null || cluster.growthRate === undefined
    ? 0
    : Math.round(cluster.growthRate * 100);

  if (growthPercent >= 30) {
    reasons.push(wording.scoreUp(growthPercent));
  } else if (growthPercent <= -25) {
    reasons.push(wording.scoreDown(Math.abs(growthPercent)));
  }

  const previousPlatforms = new Set(prev.platforms || []);
  const newPlatforms = cluster.platforms.filter(platform => !previousPlatforms.has(platform));
  if (newPlatforms.length > 0) {
    reasons.push(wording.newSources(platformNames(newPlatforms)));
  }

  if (prev.bestRank && cluster.bestRank && cluster.bestRank < prev.bestRank) {
    reasons.push(wording.rankUp(prev.bestRank, cluster.bestRank));
  }

  if ((prev.platforms || []).length && cluster.platformCount > (prev.platforms || []).length) {
    reasons.push(wording.moreSources((prev.platforms || []).length, cluster.platformCount));
  }

  if (reasons.length === 0) {
    reasons.push(wording.unchanged);
  }

  return reasons;
}

function buildTopicKey(cluster) {
  const entityPart = [...new Set(cluster.entityTokens || [])]
    .sort()
    .slice(0, 4)
    .join('|');
  const conceptPart = [...new Set(cluster.mainSignal.eventConcepts || [])]
    .sort()
    .slice(0, 4)
    .join('|');
  const keywordPart = [...new Set(cluster.keywords || [])]
    .map(normalizeForCompare)
    .filter(Boolean)
    .sort()
    .slice(0, 4)
    .join('|');
  const titlePart = normalizeForCompare(
    cluster.canonicalTitle || cluster.mainSignal.title || ''
  ).slice(0, 48);
  return stableHash(`${entityPart || keywordPart}:${conceptPart}:${titlePart}`);
}

function scoreClusterSignals(signals) {
  const byPlatform = new Map();
  signals.forEach(signal => {
    if (!byPlatform.has(signal.platform)) byPlatform.set(signal.platform, []);
    byPlatform.get(signal.platform).push(scoreSignal(signal));
  });

  let total = 0;
  for (const scores of byPlatform.values()) {
    scores.sort((a, b) => b - a);
    const strongest = scores[0] || 0;
    const aliasBonus = Math.min(
      strongest * 0.3,
      scores.slice(1).reduce((sum, score) => sum + score * 0.15, 0)
    );
    total += strongest + aliasBonus;
  }
  return Math.round(total);
}

function normalizedAliases(cluster) {
  return new Set((cluster.aliases || cluster.signals.map(signal => signal.title))
    .map(normalizeForCompare)
    .filter(Boolean));
}

function findPreviousCluster(cluster, previousByKey, candidateKey) {
  if (previousByKey[candidateKey]) {
    return { key: candidateKey, value: previousByKey[candidateKey] };
  }

  const currentAliases = normalizedAliases(cluster);
  const currentTitle = normalizeForCompare(cluster.canonicalTitle || cluster.mainSignal.title);
  let best = null;

  for (const [key, previous] of Object.entries(previousByKey)) {
    const previousAliases = new Set([
      previous.title,
      previous.canonicalTitle,
      ...(previous.aliases || [])
    ].map(normalizeForCompare).filter(Boolean));
    if (currentAliases.size === 1 && previousAliases.size > 1) {
      continue;
    }
    let overlap = 0;
    currentAliases.forEach(alias => {
      if (previousAliases.has(alias)) overlap++;
    });
    const sameCanonicalTitle = currentTitle &&
      currentTitle === normalizeForCompare(previous.canonicalTitle || previous.title);
    const score = overlap * 10 + (sameCanonicalTitle ? 5 : 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { key, value: previous, score };
    }
  }

  return best;
}

// English: the strongest title written in words, rather than a hashtag, names the event.
function readableTitle(signals) {
  return (signals.find(signal => !english.isHashtag(signal.title)) || signals[0]).title;
}

function finalizeCluster(cluster, previousByKey, options = {}) {
  cluster.signals.sort((a, b) => scoreSignal(b) - scoreSignal(a));
  cluster.mainSignal = cluster.signals[0];
  cluster.canonicalTitle = options.canonicalTitle ||
    cluster.canonicalTitle ||
    (isEnglish() ? readableTitle(cluster.signals) : cluster.mainSignal.title);
  cluster.aliases = [...new Set(cluster.signals.map(signal => signal.title).filter(Boolean))];
  cluster.keywords = [...new Set(cluster.signals.flatMap(signal => signal.matchedKeywords || []))];
  cluster.entityTokens = [...new Set(cluster.signals.flatMap(signal => signal.entityTokens || []))];
  cluster.eventConcepts = [...new Set(cluster.signals.flatMap(signal => signal.eventConcepts || []))];
  cluster.category = dominantCategory(cluster.signals);
  cluster.platforms = [...new Set(cluster.signals.map(signal => signal.platform))];
  cluster.platformCount = cluster.platforms.length;
  cluster.platformSummary = summarizePlatforms(cluster.signals);
  cluster.bestRank = Math.min(...cluster.signals.map(signal => signal.rank || 999));
  cluster.totalHeat = cluster.signals.reduce((sum, signal) => sum + (signal.heat || 0), 0);

  const signalScore = scoreClusterSignals(cluster.signals);
  const crossPlatformBonus = Math.max(0, cluster.platformCount - 1) * 22;
  const strongSourceBonus = cluster.signals.some(signal => signal.rank && signal.rank <= 3) ? 12 : 0;
  cluster.score = Math.round(signalScore + crossPlatformBonus + strongSourceBonus);
  const candidateKey = buildTopicKey(cluster);
  const previousMatch = findPreviousCluster(cluster, previousByKey, candidateKey);
  cluster.topicKey = previousMatch?.key || candidateKey;
  cluster.topicId = cluster.topicKey;

  const prev = previousMatch?.value || previousByKey[cluster.topicKey];
  const earliestSignalTime = cluster.signals
    .map(signal => signal.capturedAt)
    .sort()[0];
  cluster.firstSeenAt = prev?.firstSeenAt || earliestSignalTime || new Date().toISOString();
  cluster.lastSeenAt = new Date().toISOString();
  cluster.previousScore = prev?.score || 0;
  cluster.growthRate = cluster.previousScore ? Number(((cluster.score - cluster.previousScore) / cluster.previousScore).toFixed(2)) : null;
  cluster.status = statusFrom(prev, cluster.score, cluster.firstSeenAt);
  cluster.statusLabel = statusLabel(cluster.status);
  cluster.broadcastReasons = buildBroadcastReasons(cluster, prev);
  cluster.previousSignalKeys = prev?.signalKeys || [];
  cluster.eventMerge = options.eventMerge || cluster.eventMerge || null;

  return cluster;
}

function rebuildClusterFromSignals(signals, previousState = {}, options = {}) {
  const preparedSignals = signals.map(signal => ({
    ...signal,
    tokens: signal.tokens || extractTokens(signal),
    entityTokens: signal.entityTokens || extractEntityTokens(signal),
    eventConcepts: signal.eventConcepts || extractEventConcepts(signal.title)
  }));
  const cluster = {
    signals: preparedSignals,
    tokens: [...new Set(preparedSignals.flatMap(signal => signal.tokens || []))].slice(0, 60),
    keywords: [...new Set(preparedSignals.flatMap(signal => signal.matchedKeywords || []))],
    entityTokens: [...new Set(preparedSignals.flatMap(signal => signal.entityTokens || []))].slice(0, 40),
    eventConcepts: [...new Set(preparedSignals.flatMap(signal => signal.eventConcepts || []))].slice(0, 20),
    canonicalTitle: options.canonicalTitle || null,
    eventMerge: options.eventMerge || null
  };
  return finalizeCluster(cluster, previousState.clustersByKey || {}, options);
}

function clusterSignals(signals, previousState = {}, config = {}) {
  const threshold = config.similarityThreshold ?? text().similarityThreshold;
  const previousByKey = previousState.clustersByKey || {};
  const enrichedSignals = signals.map(signal => ({
    ...signal,
    tokens: extractTokens(signal),
    entityTokens: extractEntityTokens(signal),
    eventConcepts: extractEventConcepts(signal.title)
  })).sort((a, b) => scoreSignal(b) - scoreSignal(a));

  const clusters = [];
  for (const signal of enrichedSignals) {
    let bestCluster = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const currentScore = similarity(signal, cluster);
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestScore >= threshold) {
      bestCluster.signals.push(signal);
      bestCluster.tokens = [...new Set([...bestCluster.tokens, ...signal.tokens])].slice(0, 60);
      bestCluster.keywords = [...new Set([...bestCluster.keywords, ...(signal.matchedKeywords || [])])];
      bestCluster.entityTokens = [...new Set([...bestCluster.entityTokens, ...signal.entityTokens])].slice(0, 40);
      bestCluster.eventConcepts = [...new Set([...bestCluster.eventConcepts, ...signal.eventConcepts])].slice(0, 20);
    } else {
      clusters.push({
        signals: [signal],
        tokens: signal.tokens,
        keywords: signal.matchedKeywords || [],
        entityTokens: signal.entityTokens || [],
        eventConcepts: signal.eventConcepts || []
      });
    }
  }

  return clusters
    .map(cluster => finalizeCluster(cluster, previousByKey))
    .sort((a, b) => b.score - a.score);
}

function buildNextState(clusters) {
  const clustersByKey = {};
  clusters.forEach(cluster => {
    clustersByKey[cluster.topicKey] = {
      title: cluster.mainSignal.title,
      canonicalTitle: cluster.canonicalTitle || cluster.mainSignal.title,
      aliases: cluster.aliases || [],
      signalKeys: (cluster.signals || []).map(signal =>
        `${signal.platform}:${signal.normalizedTitle || normalizeForCompare(signal.title || '')}`
      ),
      score: cluster.score,
      bestRank: cluster.bestRank,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      platforms: cluster.platforms
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    clustersByKey
  };
}

module.exports = {
  clusterSignals,
  buildNextState,
  rebuildClusterFromSignals,
  scoreSignal,
  scoreClusterSignals,
  statusLabel
};
