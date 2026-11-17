// English wording for briefings and alerts. Labels follow the adaptation plan:
// the layout of v1.3.20 is kept line by line; only the words, units and time zone change.

const STATUS_LABELS = {
  new: 'New',
  rising: 'Rising',
  holding: 'Holding',
  steady: 'Steady',
  cooling: 'Cooling'
};

const BASIS_STATUS = {
  new: 'new this run',
  rising: 'rising',
  holding: 'still on the lists',
  steady: 'steady',
  cooling: 'cooling'
};

function shorten(value, divisor, unit, oneDecimalBelow) {
  const scaled = value / divisor;
  const text = scaled.toFixed(value >= oneDecimalBelow ? 0 : 1).replace(/\.0$/, '');
  return `${text}${unit}`;
}

// 85,000,000 → "85M", 1,500,000 → "1.5M", 20,000 → "20K".
function formatHeat(num) {
  if (num >= 1e9) return shorten(num, 1e9, 'B', 1e10);
  if (num >= 1e6) return shorten(num, 1e6, 'M', 1e7);
  if (num >= 1e3) return shorten(num, 1e3, 'K', 1e4);
  return String(num);
}

function inferTopicTerm(title = '', knownTerms = []) {
  const text = String(title)
    .replace(/[“”"]/g, '')
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = text.toLowerCase();
  const entities = knownTerms.filter(term => lower.includes(String(term).toLowerCase()));
  if (entities.length) return entities.slice(0, 3).join(' ');

  const segments = text
    .split(/\s*[:|–—]\s*|\s+-\s+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  return segments.find(segment => segment.length >= 3 && segment.length <= 60) || text.slice(0, 60);
}

// Titles keep apostrophes (L'Oréal, women's); straight and curly double quotes are dropped.
// v1.3.20's #topic# marker is Weibo's, so English "#a #b" hashtags are left alone.
function normalizeTitle(title, decodeHtml) {
  return decodeHtml(title)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[“”"]/g, '')
    .replace(/[|｜·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// For keys and exact comparison: letters and digits only (accents kept), so that
// "#SunscreenRecall" and "sunscreen recall" give the same key.
function normalizeForCompare(normalizedTitle) {
  return normalizedTitle
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Words that say nothing about which event a title is about.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with',
  'about', 'as', 'into', 'over', 'after', 'before', 'vs', 'v', 'versus', 'is', 'are', 'was', 'were',
  'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'how', 'why', 'what', 'who', 'when',
  'where', 'which', 'will', 'can', 'does', 'do', 'did', 'has', 'have', 'had', 'not', 'no', 'yes',
  'new', 'latest', 'today', 'tonight', 'tomorrow', 'yesterday', 'now', 'news', 'live', 'update',
  'updates', 'video', 'videos', 'watch', 'official', 'full', 'best', 'top', 'near', 'me', 'my',
  'your', 'you', 'we', 'they', 'he', 'she', 'his', 'her', 'their', 'our', 'fyp', 'foryou',
  'foryoupage', 'viral', 'trending', 'trend', 'trends'
]);

// Common words that name no event when a title is that word alone. In testing, Google's Politics list
// had "them" and its Sports list "found", and each took in posts that only used the word. Team and
// place names (heat, magic, jets, turkey) are left out on purpose.
const COMMON_WORDS = new Set([
  'i', 'him', 'us', 'them', 'mine', 'yours', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself',
  'itself', 'ourselves', 'themselves', 'whom', 'whose', 'whatever', 'whoever', 'everyone', 'everybody',
  'everything', 'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything', 'nobody', 'nothing',
  'none', 'all', 'any', 'some', 'each', 'every', 'both', 'either', 'neither', 'few', 'many', 'much', 'more',
  'most', 'less', 'least', 'other', 'others', 'another', 'such', 'same', 'own', 'several', 'enough',
  'am', 'being', 'could', 'would', 'should', 'shall', 'may', 'might', 'must', 'done', 'doing', 'having',
  'get', 'gets', 'getting', 'got', 'gotten', 'go', 'goes', 'going', 'went', 'gone', 'come', 'comes',
  'coming', 'came', 'make', 'makes', 'making', 'made', 'take', 'takes', 'taking', 'took', 'taken', 'give',
  'gives', 'giving', 'gave', 'given', 'see', 'sees', 'seeing', 'saw', 'seen', 'know', 'knows', 'knew',
  'known', 'think', 'thinks', 'thought', 'say', 'says', 'saying', 'said', 'tell', 'tells', 'told', 'find',
  'finds', 'finding', 'found', 'look', 'looks', 'looking', 'looked', 'want', 'wants', 'wanted', 'need',
  'needs', 'needed', 'use', 'used', 'using', 'try', 'tried', 'trying', 'ask', 'asked', 'feel', 'felt',
  'keep', 'kept', 'let', 'lets', 'put', 'mean', 'means', 'meant', 'seem', 'seems', 'seemed', 'leave',
  'leaves', 'left', 'call', 'calls', 'called', 'show', 'shows', 'showed', 'shown', 'hear', 'heard',
  'turn', 'turned', 'start', 'started', 'begin', 'began', 'begun', 'help', 'helped', 'talk', 'talked',
  'bring', 'brought', 'happen', 'happens', 'happened', 'become', 'became', 'believe', 'hold', 'held',
  'stand', 'stood', 'sit', 'sat', 'lose', 'lost', 'pay', 'paid', 'meet', 'met', 'set', 'read', 'run',
  'ran', 'move', 'moved', 'like', 'liked', 'love', 'loved', 'wait', 'stay', 'fall', 'fell', 'reach',
  'remain', 'change', 'changed', 'follow', 'followed', 'stop', 'stopped', 'add', 'added', 'buy',
  'bought', 'sell', 'sold', 'send', 'sent', 'build', 'built', 'spend', 'spent', 'allow', 'offer',
  'remember', 'appear', 'expect', 'decide', 'return', 'explain', 'hope', 'wish', 'agree', 'check',
  'share', 'shared', 'post', 'posted', 'again', 'ago', 'almost', 'already', 'also', 'always', 'anyway',
  'around', 'away', 'back', 'because', 'below', 'between', 'beyond', 'during', 'else', 'even', 'ever',
  'finally', 'here', 'however', 'just', 'later', 'maybe', 'never', 'often', 'once', 'only', 'out',
  'perhaps', 'quite', 'rather', 'really', 'since', 'so', 'soon', 'still', 'than', 'then', 'there',
  'though', 'through', 'together', 'too', 'under', 'until', 'up', 'down', 'off', 'very', 'well', 'while',
  'without', 'within', 'yet', 'if', 'unless', 'whether', 'although', 'against', 'along', 'among',
  'behind', 'beside', 'besides', 'despite', 'inside', 'outside', 'toward', 'towards', 'upon', 'per',
  'via', 'onto', 'throughout', 'thing', 'things', 'people', 'person', 'man', 'men', 'woman', 'women',
  'guy', 'guys', 'kid', 'kids', 'time', 'times', 'day', 'days', 'week', 'weeks', 'month', 'months',
  'year', 'years', 'way', 'ways', 'life', 'lives', 'part', 'place', 'case', 'point', 'fact', 'number',
  'group', 'problem', 'hand', 'home', 'work', 'word', 'words', 'end', 'kind', 'side', 'lot', 'lots',
  'good', 'great', 'little', 'big', 'small', 'long', 'old', 'young', 'high', 'low', 'bad', 'better',
  'right', 'wrong', 'real', 'true', 'sure', 'whole', 'able', 'last', 'next', 'first', 'second', 'early',
  'late', 'different', 'important', 'possible', 'certain', 'free', 'open', 'okay', 'ok', 'hello', 'hi',
  'hey', 'thanks', 'thank', 'please', 'sorry', 'lol', 'omg', 'wow', 'yeah', 'oh', 'ah', 'story',
  'stories', 'moment', 'moments'
]);

// Kinds of event, as in v1.3.20's 14 patterns: two titles about the same people but different
// kinds of event (a trade and an injury) are kept apart.
const EVENT_CONCEPTS = [
  { concept: 'hat_trick', pattern: /hat[- ]?trick/i },
  { concept: 'goal', pattern: /\bgoals?\b|\bscores?\b|\bscored\b|winner|equali[sz]er|free kick|penalty kick/i },
  { concept: 'foul_injury', pattern: /injur|\bfoul|red card|yellow card|suspen|ejected|concussion|\btorn\b|sprain|\bout for\b/i },
  { concept: 'fan_support', pattern: /\bfans?\b|supporters|\bcrowd\b|chant/i },
  { concept: 'win_loss', pattern: /\bwins?\b|\bwon\b|\bbeats?\b|\bloses?\b|\blost\b|defeat|eliminat|advances?|clinch|champions?\b|upset|comeback|victory/i },
  { concept: 'award', pattern: /award|\bmvp\b|player of the|nominat|honou?red/i },
  { concept: 'record', pattern: /record|all-time|milestone|career-high|first ever/i },
  { concept: 'response', pattern: /respond|response|apolog|statement|denies|\bdeny\b|slams|criticiz|clarif|addresses/i },
  { concept: 'mechanism', pattern: /algorithm|matchmaking|\belo\b|ranked mode|rule change/i },
  { concept: 'lineup_schedule', pattern: /schedule|lineup|roster|\bdraft\b|fixtures|start time|how to watch|tv channel|tickets/i },
  { concept: 'stats', pattern: /\bstats?\b|statistics|standings|rankings?\b|leaders\b/i },
  { concept: 'transfer_trade', pattern: /\btrade[sd]?\b|\bsign(s|ed|ing)?\b|contract|transfer|free agen|waive[sd]?\b/i },
  { concept: 'release_update', pattern: /\bupdate\b|patch|launch|release|\bdrops?\b|new season|version|collab|collection|restock|recall/i },
  { concept: 'appearance', pattern: /interview|concert|\btour\b|red carpet|performance|live ?stream|podcast|premiere/i }
];

// Rules for merging events (lib/event-threader.js), translated from v1.3.20.
const MERGE_RULES = {
  vagueTitles: [/continues? to trend/i, /sparks? (discussion|debate)/i, /draws? attention/i,
    /in the spotlight/i, /latest (news|updates)/i, /related (news|updates|topics)/i],
  vagueAnchors: [/related (news|events?|topics?)$/i, /recent (news|updates)$/i,
    /^(the )?same (person|player|team|club|game|brand|company|category)/i,
    /^(person|player|team|club|game|brand|event) (news|updates)$/i],
  genericEvidence: /keyword match|same (category|topic|person|player|team|club|game|brand|company)|both (are|mention|relate)/i,
  disciplines: [
    ['mixed_doubles', /mixed doubles/i],
    ['mens_singles', /men'?s singles/i],
    ['womens_singles', /women'?s singles/i],
    ['mens_doubles', /men'?s doubles/i],
    ['womens_doubles', /women'?s doubles/i]
  ],
  stages: [
    ['r16', /round of 16|last 16/i],
    ['qf', /quarter-?finals?/i],
    ['sf', /semi-?finals?/i],
    ['final', /\bfinals?\b|championship game|title game/i]
  ],
  competitions: [
    ['world_cup', /world cup/i],
    ['champions_league', /champions league/i],
    ['nba', /\bnba\b/i],
    ['nfl', /\bnfl\b/i],
    ['super_bowl', /super bowl/i],
    ['olympics', /olympic/i]
  ],
  minEvidenceLength: 12,
  fingerprintReason: 'Same competition and stage, with the same people or team',
  retitleReason: 'One title for the search terms of this event'
};

module.exports = {
  code: 'en',
  merge: MERGE_RULES,
  normalizeTitle,
  normalizeForCompare,
  stopWords: STOP_WORDS,
  commonWords: COMMON_WORDS,
  eventConcepts: EVENT_CONCEPTS,
  // Grouping threshold for word-based similarity; to be set in calibration.
  similarityThreshold: 0.5,
  formatHeat,
  // Sources can give their own heat text (Google Trends: "20K+") and a unit ("views").
  displayHeat: (signal, format, unit) =>
    `${signal.heatText || format(signal.heat)}${unit ? ` ${unit}` : ''}`,
  signalBrief: ({ label, board, rank, heat }) =>
    `${board ? `${label}/${board}` : label} ${rank ? `#${rank}` : 'unranked'}${heat ? ` ${heat}` : ''}`,
  nameJoin: ', ',
  heatJoin: ', ',
  pipe: ' | ',
  or: ' or ',
  unknownSource: 'an unknown source',
  uncategorized: 'Uncategorized',
  statusLabels: STATUS_LABELS,
  basisStatus: BASIS_STATUS,
  basisStatusFallback: statusLabel => `status: ${statusLabel || 'not yet clear'}`,
  growth: {
    first: 'first seen',
    up: percent => `score up ${percent}% since the previous run`,
    down: percent => `score down ${percent}% since the previous run`,
    flat: 'score about the same as the previous run'
  },
  trend: {
    belowPeak: percent => `${percent}% below this hour's peak`,
    atPeak: "at this hour's peak",
    mainSource: 'main source',
    peak: ({ source, rank, heat, time }) =>
      `${source} peak this hour: ${rank ? `#${rank} ` : ''}${heat}${time ? ` (${time})` : ''}`,
    join: ', ',
    withGrowth: (basis, growth) => `${basis}, ${growth}`
  },
  performance: {
    multi: count => `on ${count} sources`,
    single: names => `only on ${names}`,
    aliases: count => `${count} search terms for the same event`,
    repeat: 'also in the previous briefing',
    first: 'first time in the briefing',
    join: '; ',
    end: '.'
  },
  levels: { strong: 'Strong', follow: 'Follow up', watch: 'Watch' },
  displayScore: (score, level) => `${score}/100 (${level})`,
  reasons: {
    first: 'first time as a briefing candidate',
    scoreUp: percent => `score up ${percent}% since the previous run`,
    scoreDown: percent => `score down ${percent}% since the previous run`,
    newSources: names => `new signal from ${names}`,
    rankUp: (previous, current) => `best rank up from #${previous} to #${current}`,
    moreSources: (previous, current) => `sources up from ${previous} to ${current}`,
    unchanged: 'still listed; score and sources about the same'
  },
  inferTopicTerm,
  report: {
    title: '# Trend Briefing',
    generated: (dateTime, zone) => `Generated: ${dateTime}${zone ? ` ${zone}` : ''}`,
    noItems: seeds => `No trend on ${seeds} met the selection rules this run.`,
    scoreLine: score => `**Score: ${score}**`,
    signalsLine: text => `**Signals:** ${text}`,
    summaryLine: summary => `**Summary:** ${summary || 'No reliable summary yet.'}`,
    watchlistHeading: '### Watch list',
    watchlistLine: (title, statusLabel, heat) => `- ${title}: ${statusLabel} | ${heat}`,
    followedHeading: '### From sources you follow',
    followedLine: (category, title, score, heat) => `- ${category} | ${title} | Score ${score} | ${heat}`,
    pushTitle: 'Trend Briefing'
  },
  alert: {
    heading: label => `🔥 ${label} high-heat alert`,
    rankHeat: (rank, heat) => (heat ? `Rank: #${rank} | Heat: ${heat}` : `Rank: #${rank}`),
    summary: summary => `Summary: ${summary}`,
    viewDetails: 'View details',
    trigger: rule => `Trigger: ${rule}`,
    time: (clock, zone) => `Triggered at: ${clock}${zone ? ` ${zone}` : ''}`,
    rules: { both: 'heat & rank rule', heat: 'heat rule', rank: 'rank rule' }
  },
  noSummary: 'No summary yet'
};
