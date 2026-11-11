const crypto = require('crypto');

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

function normalizeTitle(title = '') {
  return decodeHtml(title)
    .replace(/#([^#]+)#/g, '$1')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/【[^】]+】/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/[|｜·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForCompare(title = '') {
  return normalizeTitle(title)
    .toLowerCase()
    .replace(/微博|抖音|虎扑|贴吧|热搜|热榜|话题|回应|最新|官方|排名|讨论|冲上/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, '')
    .trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).replace(/,/g, '').trim();
  const matched = text.match(/([\d.]+)\s*(亿|万|w|W)?/);
  if (!matched) return 0;
  const num = parseFloat(matched[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = matched[2];
  if (unit === '亿') return Math.round(num * 100000000);
  if (unit === '万' || unit === 'w' || unit === 'W') return Math.round(num * 10000);
  return Math.round(num);
}

function formatHeat(value) {
  const num = parseNumber(value);
  if (!num) return '0';
  if (num >= 100000000) return `${(num / 100000000).toFixed(num >= 1000000000 ? 1 : 2).replace(/\.0+$/, '')}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '')}万`;
  return String(num);
}

function stableHash(input, length = 12) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, length);
}

function platformLabel(platform) {
  // Required here, not at the top: the registry loads adapters, which load this file.
  return require('./source-registry').sourceLabel(platform);
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
    matchedKeywords: input.matchedKeywords || []
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
  stableHash,
  platformLabel,
  makeSignal,
  absoluteUrl
};
