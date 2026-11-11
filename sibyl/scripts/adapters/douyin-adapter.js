const { requestJson } = require('../lib/http');
const { makeSignal } = require('../lib/signals');

const DEFAULT_URL = 'https://apinews.geekaso.com/douyin';

async function fetchDouyinSignals(config = {}) {
  const data = await requestJson(config.url || DEFAULT_URL, {
    timeout: config.timeout || 20000,
    retries: config.retries ?? 2,
    headers: {
      Accept: 'application/json'
    }
  });

  const list = Array.isArray(data?.data) ? data.data : (data?.data?.list || data?.list || []);
  const maxItems = config.maxItems || 50;
  return list.slice(0, maxItems).map((item, index) => {
    const title = item.title || item.word || item.content || item.name || '';
    const heat = item.hot_value || item.hot || item.value || item.score || 0;
    return makeSignal({
      platform: 'douyin',
      sourceType: 'hot_board',
      title,
      rank: item.rank || index + 1,
      heat,
      url: item.url || `https://www.douyin.com/search/${encodeURIComponent(title)}`,
      raw: item
    });
  }).filter(signal => signal.title);
}

const source = {
  id: 'douyin',
  label: '抖音',
  weight: 1.0,
  sourceTypeWeights: { hot_board: 0.95 },
  displayOrder: 1,
  defaultRole: 'seed',
  fetch: fetchDouyinSignals,
  link: (cluster, helpers) => helpers.platformSearchLink(
    cluster,
    'douyin',
    '查看抖音话题',
    '搜索抖音关键词',
    encoded => `https://www.douyin.com/search/${encoded}`
  )
};

module.exports = {
  fetchDouyinSignals,
  source
};
