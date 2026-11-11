const crypto = require('crypto');

const { text } = require('./locale');

function decodeHtml(text = '') {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(text = '') {
  return decodeHtml(String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Title cleaning and comparison keys follow the output language (lib/lang/*.js).
function normalizeTitle(title = '') {
  return text().normalizeTitle(title, decodeHtml);
}

function normalizeForCompare(title = '') {
  return text().normalizeForCompare(normalizeTitle(title));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/,/g, '').trim();
  // K, M and B as in "20K+" (Google Trends) or "325.3M" (TikTok). A letter after the unit
  // (as in "5 mins") means it is not a unit.
  const matched = text.match(/([\d.]+)\s*([kKmMbB](?![a-zA-Z]))?/);
  if (!matched) return 0;
  const num = parseFloat(matched[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = matched[2];
  if (unit === 'k' || unit === 'K') return Math.round(num * 1000);
  if (unit === 'm' || unit === 'M') return Math.round(num * 1000000);
  if (unit === 'b' || unit === 'B') return Math.round(num * 1000000000);
  return Math.round(num);
}

// Heat in the configured language's units, such as "1.2M".
function formatHeat(value) {
  const num = parseNumber(value);
  if (!num) return '0';
  return text().formatHeat(num);
}

function stableHash(input, length = 12) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

function platformLabel(platform) {
  // Required here, not at the top: the registry loads adapters, which load this file.
  return require('./source-registry').sourceLabel(platform);
}

function heatUnit(platform, sourceType) {
  const source = require('./source-registry').getSource(platform);
  return source?.heatUnits?.[sourceType] ?? source?.heatUnit ?? '';
}

function showsBoard(platform) {
  return require('./source-registry').getSource(platform)?.showBoard !== false;
}

// Heat as shown next to a rank, such as "85M views" or "20K+ searches".
function displayHeat(signal) {
  return text().displayHeat(signal, formatHeat, heatUnit(signal.platform, signal.sourceType));
}

// One source's rank and heat, such as "TikTok #2 85M views".
function formatSignalBrief(signal) {
  return text().signalBrief({
    label: signal.platformLabel,
    board: showsBoard(signal.platform) ? signal.board : null,
    rank: signal.rank,
    heat: signal.heat ? displayHeat(signal) : ''
  });
}

function makeSignal(input) {
  const title = normalizeTitle(input.title || '');
  const heat = parseNumber(input.heat);
  return {
    id: input.id || stableHash(`${input.platform}:${input.sourceType || ''}:${title}:${input.url || ''}`),
    platform: input.platform,
    platformLabel: platformLabel(input.platform),
    sourceType: input.sourceType || 'hot',
    board: input.board || null,
    title,
    normalizedTitle: normalizeForCompare(title),
    rank: Number(input.rank) || null,
    heat,
    heatText: input.heatText || formatHeat(heat),
    url: input.url || '',
    engagement: input.engagement || {},
    raw: input.raw || null,
    capturedAt: input.capturedAt || new Date().toISOString(),
    matchedKeywords: input.matchedKeywords || [],
    // News links for summaries (Google Trends, feeds); absent for sources without them.
    ...(Array.isArray(input.evidence) && input.evidence.length ? { evidence: input.evidence } : {}),
    // The user's topic a saved page was read for (pages.json "topic").
    ...(input.topicHint ? { topicHint: String(input.topicHint) } : {})
  };
}

function absoluteUrl(href, baseUrl) {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch (e) {
    return href;
  }
}

module.exports = {
  decodeHtml,
  stripHtml,
  normalizeTitle,
  normalizeForCompare,
  parseNumber,
  formatHeat,
  displayHeat,
  formatSignalBrief,
  stableHash,
  platformLabel,
  makeSignal,
  absoluteUrl
};
