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

module.exports = {
  code: 'en',
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
    rankHeat: (rank, heat) => `Rank: #${rank} | Heat: ${heat}`,
    summary: summary => `Summary: ${summary}`,
    viewDetails: 'View details',
    trigger: rule => `Trigger: ${rule}`,
    time: (clock, zone) => `Triggered at: ${clock}${zone ? ` ${zone}` : ''}`,
    rules: { both: 'heat & rank rule', heat: 'heat rule', rank: 'rank rule' }
  },
  noSummary: 'No summary yet'
};
