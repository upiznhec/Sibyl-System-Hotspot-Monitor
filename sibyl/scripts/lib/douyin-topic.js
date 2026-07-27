const { requestText } = require('./http');
const { classifySignal } = require('./category-classifier');

const TEXT_KEYS = new Set([
  'desc', 'description', 'title', 'content', 'shareTitle', 'share_title'
]);

function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function usefulText(value, topicTitle) {
  const text = decodeHtml(value)
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 8 || text.length > 320) return '';
  if (text === topicTitle || /^抖音热点榜/.test(text)) return '';
  if (/^(https?:|douyin\.com|javascript:)/i.test(text)) return '';
  return text;
}

function walkJson(value, topicTitle, results, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => walkJson(item, topicTitle, results, seen));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'string' && TEXT_KEYS.has(key)) {
      const text = usefulText(item, topicTitle);
      if (text) results.push(text);
    } else {
      walkJson(item, topicTitle, results, seen);
    }
  });
}

function parseJsonScripts(html, topicTitle) {
  const results = [];
  const scripts = String(html).match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  scripts.forEach(script => {
    const content = script
      .replace(/^<script\b[^>]*>/i, '')
      .replace(/<\/script>$/i, '')
      .trim();
    if (!content || (!content.startsWith('{') && !content.startsWith('['))) return;
    try {
      walkJson(JSON.parse(content), topicTitle, results);
    } catch (error) {
      // Some hydration blocks are encoded or contain executable JavaScript.
    }
  });
  return results;
}

function parseDouyinTopicHtml(html, topicTitle = '') {
  const source = String(html || '');
  const results = [];
  const metaPattern = /<meta\b[^>]*(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = metaPattern.exec(source))) {
    const text = usefulText(match[1], topicTitle);
    if (text) results.push(text);
  }
  results.push(...parseJsonScripts(source, topicTitle));

  const escapedPattern = /"(?:desc|description|content|share_title|shareTitle)"\s*:\s*"((?:\\.|[^"\\]){8,500})"/g;
  while ((match = escapedPattern.exec(source))) {
    const text = usefulText(match[1], topicTitle);
    if (text) results.push(text);
  }
  return [...new Set(results)].slice(0, 8);
}

function validTopicUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)douyin\.com$/i.test(parsed.hostname) && /^\/hot\/\d+/.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}

async function retrieveDouyinTopicEvidence(signal, options = {}, dependencies = {}) {
  if (options.enabled === false || options.directPageEnabled !== true) {
    return { success: false, failureReason: 'douyin_topic_disabled' };
  }
  if (!validTopicUrl(signal?.url)) {
    return { success: false, failureReason: 'douyin_topic_url_missing' };
  }
  const fetchText = dependencies.requestText || requestText;
  let html;
  try {
    html = await fetchText(signal.url, {
      timeout: options.timeout || 12000,
      retries: options.retries ?? 0
    });
  } catch (error) {
    return {
      success: false,
      failureReason: /timeout/i.test(error.message)
        ? 'douyin_topic_timeout'
        : 'douyin_topic_request_failed'
    };
  }
  const items = parseDouyinTopicHtml(html, signal.title);
  if (!items.length) {
    return { success: false, failureReason: 'douyin_topic_content_empty' };
  }
  return {
    success: true,
    source: 'douyin-topic-page',
    evidenceText: items.map(item => `[抖音关联视频文案] ${item}`).join('\n'),
    itemCount: items.length,
    sourceUrl: signal.url
  };
}

function buildDouyinHotListEvidence(signal, signals = [], options = {}) {
  const target = classifySignal(signal);
  const targetKeywords = new Set(target.matchedKeywords || []);
  const related = signals
    .filter(item => item.platform === 'douyin' && item.title && item.title !== signal.title)
    .map(item => {
      const classification = classifySignal(item);
      const overlap = (classification.matchedKeywords || [])
        .filter(keyword => targetKeywords.has(keyword));
      return { item, classification, overlap };
    })
    .filter(entry => entry.classification.category === target.category && entry.overlap.length)
    .sort((left, right) =>
      right.overlap.length - left.overlap.length ||
      (left.item.rank || 999) - (right.item.rank || 999)
    )
    .slice(0, Math.max(2, Number(options.relatedTopicLimit) || 8));
  if (!related.length) {
    return { success: false, failureReason: 'douyin_related_topics_empty' };
  }
  const topics = [signal, ...related.map(entry => entry.item)];
  return {
    success: true,
    source: 'douyin-hot-context',
    itemCount: topics.length,
    evidenceText: topics.map(item =>
      `[抖音热榜关联话题] #${item.rank || '-'} ${item.title}（热度${item.heat || 0}）`
    ).join('\n'),
    relatedTitles: topics.map(item => item.title)
  };
}

module.exports = {
  buildDouyinHotListEvidence,
  parseDouyinTopicHtml,
  retrieveDouyinTopicEvidence,
  validTopicUrl
};
