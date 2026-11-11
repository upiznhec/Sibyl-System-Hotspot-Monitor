const { requestText } = require('../lib/http');
const { absoluteUrl, makeSignal, parseNumber, stripHtml } = require('../lib/signals');

const DEFAULT_HOT_TOPIC_URL = 'https://tieba.baidu.com/hottopic/browse/topicList?res_type=1';

function collectTopicObjects(value, output = []) {
  if (!value || output.length > 200) return output;
  if (Array.isArray(value)) {
    value.forEach(item => collectTopicObjects(item, output));
    return output;
  }
  if (typeof value !== 'object') return output;

  const title = value.topic_name || value.topicName || value.title || value.name || value.text;
  const heat = value.discuss_num || value.discussNum || value.hot_value || value.hotValue || value.heat || value.num;
  const url = value.topic_url || value.topicUrl || value.url || value.link;
  if (title && (heat || url)) {
    output.push({ title, heat, url, raw: value });
  }

  Object.values(value).forEach(child => collectTopicObjects(child, output));
  return output;
}

function tryParseJsonTopics(text) {
  try {
    const parsed = JSON.parse(text);
    return collectTopicObjects(parsed);
  } catch (e) {
    return [];
  }
}

function parseJsonFragments(text) {
  const topics = [];
  const seen = new Set();
  const blockRegex = /\{[^{}]*(?:"topic_name"|"topicName"|"title")[^{}]*\}/g;
  let match;

  while ((match = blockRegex.exec(text)) && topics.length < 100) {
    try {
      const parsed = JSON.parse(match[0].replace(/\\"/g, '"'));
      const title = parsed.topic_name || parsed.topicName || parsed.title || parsed.name;
      if (!title || seen.has(title)) continue;
      seen.add(title);
      topics.push({
        title,
        heat: parsed.discuss_num || parsed.discussNum || parsed.hot_value || parsed.heat || parsed.num || 0,
        url: parsed.topic_url || parsed.topicUrl || parsed.url || '',
        raw: parsed
      });
    } catch (e) {
      // Ignore malformed inline JSON fragments.
    }
  }

  return topics;
}

function parseHtmlTopics(text, baseUrl) {
  const topics = [];
  const seen = new Set();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(text)) && topics.length < 100) {
    const href = match[1];
    const title = stripHtml(match[2]);
    if (!title || title.length < 4 || title.length > 80) continue;
    if (!/(hottopic|topic|\/p\/|\/f\?)/i.test(href)) continue;
    if (/更多|登录|注册|首页|贴吧|客户端|反馈/.test(title)) continue;
    if (seen.has(title)) continue;

    const nearby = text.slice(match.index, match.index + 500);
    const heatMatch = nearby.match(/([\d.]+\s*(?:万|亿)?)\s*(?:讨论|热度|浏览|回复|帖)/);
    seen.add(title);
    topics.push({
      title,
      heat: heatMatch ? parseNumber(heatMatch[1]) : 0,
      url: absoluteUrl(href, baseUrl)
    });
  }

  return topics;
}

async function fetchTiebaSignals(config = {}) {
  const url = config.hotTopicUrl || DEFAULT_HOT_TOPIC_URL;
  const text = await requestText(url, {
    timeout: config.timeout || 15000,
    retries: config.retries ?? 1,
    headers: {
      Referer: 'https://tieba.baidu.com/'
    }
  });

  const parsedTopics = [
    ...tryParseJsonTopics(text),
    ...parseJsonFragments(text),
    ...parseHtmlTopics(text, url)
  ];

  const seen = new Set();
  const maxItems = config.maxItems || 50;
  return parsedTopics
    .filter(topic => {
      const key = String(topic.title || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems)
    .map((topic, index) => makeSignal({
      platform: 'tieba',
      sourceType: 'hot_topic',
      title: topic.title,
      rank: topic.rank || index + 1,
      heat: topic.heat || 0,
      url: topic.url ? absoluteUrl(topic.url, url) : url,
      raw: topic.raw || null
    }));
}

const source = {
  id: 'tieba',
  label: '贴吧',
  weight: 0.5,
  sourceTypeWeights: { hot_topic: 0.95 },
  displayOrder: 3,
  defaultRole: 'community',
  fetch: fetchTiebaSignals
};

module.exports = {
  fetchTiebaSignals,
  source
};
