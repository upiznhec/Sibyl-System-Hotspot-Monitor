const { requestText } = require('../lib/http');
const { absoluteUrl, makeSignal, parseNumber, stripHtml } = require('../lib/signals');

const DEFAULT_BOARDS = [
  { board: '步行街', url: 'https://bbs.hupu.com/all-gambia' },
  { board: '英雄联盟', url: 'https://bbs.hupu.com/lol' },
  { board: 'NBA', url: 'https://bbs.hupu.com/nba' },
  { board: '国际足球', url: 'https://bbs.hupu.com/soccer' }
];

function parseMetric(text, labels) {
  for (const label of labels) {
    const regex = new RegExp(`([\\d.,]+\\s*(?:万|亿)?)\\s*${label}`, 'i');
    const matched = text.match(regex);
    if (matched) return parseNumber(matched[1]);
  }
  return 0;
}

function parseHupuBoard(html, boardConfig) {
  const topics = [];
  const seen = new Set();
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/\d+\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) && topics.length < (boardConfig.maxItems || 30)) {
    const href = match[1];
    const title = stripHtml(match[2]);
    if (!title || title.length < 4 || title.length > 90) continue;
    if (/广告|更多|登录|注册|下载|客户端/.test(title)) continue;
    if (seen.has(title)) continue;

    const nearby = stripHtml(html.slice(Math.max(0, match.index - 250), match.index + 800));
    const replies = parseMetric(nearby, ['回复', '回帖', '评论']);
    const likes = parseMetric(nearby, ['亮', '推荐', '点亮']);
    const views = parseMetric(nearby, ['浏览', '阅读']);
    const heat = replies * 1 + likes * 3 + Math.round(views * 0.05);

    seen.add(title);
    topics.push({
      title,
      url: absoluteUrl(href, boardConfig.url),
      heat,
      engagement: { replies, likes, views }
    });
  }

  return topics;
}

async function fetchBoard(boardConfig) {
  const html = await requestText(boardConfig.url, {
    timeout: boardConfig.timeout || 15000,
    retries: boardConfig.retries ?? 1,
    headers: {
      Referer: 'https://bbs.hupu.com/'
    }
  });

  return parseHupuBoard(html, boardConfig).map((topic, index) => makeSignal({
    platform: 'hupu',
    sourceType: 'board_hot',
    board: boardConfig.board,
    title: topic.title,
    rank: index + 1,
    heat: topic.heat,
    url: topic.url,
    engagement: topic.engagement
  }));
}

async function fetchHupuSignals(config = {}) {
  const boards = config.boards && config.boards.length ? config.boards : DEFAULT_BOARDS;
  const results = await Promise.allSettled(boards.map(fetchBoard));
  const signals = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      signals.push(...result.value);
    } else {
      errors.push({
        board: boards[index].board,
        message: result.reason.message
      });
    }
  });

  if (errors.length) {
    const error = new Error(`虎扑部分板块抓取失败: ${errors.map(e => `${e.board}:${e.message}`).join('; ')}`);
    error.partialSignals = signals;
    throw error;
  }

  return signals.slice(0, config.maxItems || 80);
}

function hupuLink(cluster, helpers) {
  const hupuSignal = helpers.bestSignalForPlatform(cluster, 'hupu');
  if (hupuSignal?.url && /\/\d+\.html(?:[?#].*)?$/.test(hupuSignal.url)) {
    return `[查看虎扑热帖](${hupuSignal.url})`;
  }

  const encoded = encodeURIComponent(helpers.fallbackTopicTerm(cluster));
  return `[搜索虎扑关键词](https://bbs.hupu.com/search?q=${encoded})`;
}

const source = {
  id: 'hupu',
  label: '虎扑',
  weight: 0.6,
  sourceTypeWeights: { board_hot: 0.75 },
  sourceTypeBoosts: { board_hot: 4 },
  displayOrder: 2,
  defaultRole: 'community',
  fetch: fetchHupuSignals,
  link: hupuLink
};

module.exports = {
  fetchHupuSignals,
  DEFAULT_BOARDS,
  source
};
