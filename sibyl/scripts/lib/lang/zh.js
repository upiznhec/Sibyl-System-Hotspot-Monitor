// v1.3.20 wording (Simplified Chinese), kept word for word so that the rewrite check can
// compare output with v1.3.20. Development only; removed with the Chinese adapters.

const STATUS_LABELS = {
  new: '新上榜',
  rising: '热度上升',
  holding: '持续在榜',
  steady: '稳定观察',
  cooling: '热度回落'
};

const BASIS_STATUS = {
  new: '本轮首次进入候选',
  rising: '当前热度上升中',
  holding: '当前持续在榜',
  steady: '当前热度平稳',
  cooling: '当前热度回落中'
};

function formatHeat(num) {
  if (num >= 100000000) return `${(num / 100000000).toFixed(num >= 1000000000 ? 1 : 2).replace(/\.0+$/, '')}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(num >= 100000 ? 0 : 1).replace(/\.0$/, '')}万`;
  return String(num);
}

function includesTerm(text, term) {
  return text.toLowerCase().includes(String(term).toLowerCase());
}

function inferTopicTerm(title = '', knownTerms = []) {
  const text = String(title)
    .replace(/^原创\s*/i, '')
    .replace(/[《》“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const entities = knownTerms.filter(term => includesTerm(text, term));
  if (entities.length) return entities.slice(0, 3).join(' ');

  const segments = text
    .split(/[：:，,。！？?；;｜|\-—\s]+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  const concise = segments.find(segment =>
    segment.length >= 2 &&
    segment.length <= 18 &&
    !/^(原创|如何看待|怎么看|为什么|有没有|大家|他们|这个|那个|也期待)$/.test(segment)
  );

  return concise || text.slice(0, 18);
}

function normalizeTitle(title, decodeHtml) {
  return decodeHtml(title)
    .replace(/#([^#]+)#/g, '$1')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/【[^】]+】/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/[|｜·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForCompare(normalizedTitle) {
  return normalizedTitle
    .toLowerCase()
    .replace(/微博|抖音|虎扑|贴吧|热搜|热榜|话题|回应|最新|官方|排名|讨论|冲上/g, '')
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, '')
    .trim();
}

module.exports = {
  code: 'zh',
  normalizeTitle,
  normalizeForCompare,
  similarityThreshold: 0.42,
  formatHeat,
  displayHeat: (signal, format) => format(signal.heat),
  signalBrief: ({ label, board, rank, heat }) =>
    `${board ? `${label}/${board}` : label}${rank ? `#${rank}` : '未排名'}${heat ? ` ${heat}` : ''}`,
  nameJoin: '、',
  heatJoin: '、',
  pipe: ' ｜ ',
  or: '或',
  unknownSource: '未知',
  uncategorized: '未分类',
  statusLabels: STATUS_LABELS,
  basisStatus: BASIS_STATUS,
  basisStatusFallback: statusLabel => `当前${statusLabel || '状态待观察'}`,
  growth: {
    first: '首次出现',
    up: percent => `比上轮高 ${percent}%`,
    down: percent => `比上轮低 ${percent}%`,
    flat: '和上轮接近'
  },
  trend: {
    belowPeak: percent => `较小时最高点低 ${percent}%`,
    atPeak: '处于小时内高点',
    mainSource: '主平台',
    peak: ({ source, rank, heat, time }) =>
      `${source}小时最高 ${rank ? `#${rank} ` : ''}${heat}${time ? `（${time}）` : ''}`,
    join: '，',
    withGrowth: (basis, growth) => `${basis}，${growth}`
  },
  performance: {
    multi: count => `${count}个平台共同出现`,
    single: names => `${names}单平台出现`,
    aliases: count => `同一事件覆盖${count}个话题词`,
    repeat: '连续进入播报',
    first: '首次进入播报',
    join: '；',
    end: '。'
  },
  levels: { strong: '强热点', follow: '关注后续', watch: '观察' },
  displayScore: (score, level) => `${score}/100（${level}）`,
  reasons: {
    first: '首次进入播报候选',
    scoreUp: percent => `综合分较上轮上升 ${percent}%`,
    scoreDown: percent => `综合分较上轮下降 ${percent}%`,
    newSources: names => `新增${names}信号`,
    rankUp: (previous, current) => `最高排名从 #${previous} 升至 #${current}`,
    moreSources: (previous, current) => `覆盖平台从 ${previous} 个增至 ${current} 个`,
    unchanged: '延续在榜，综合分和平台覆盖变化不大'
  },
  inferTopicTerm,
  report: {
    title: '# 热点综合播报',
    generated: dateTime => `播报时间：${dateTime}`,
    noItems: seeds => `本轮暂无命中${seeds}热搜且达到入选标准的热点。`,
    scoreLine: score => `**综合分：${score}**`,
    signalsLine: text => `**热度表现：** ${text}`,
    summaryLine: summary => `**事件摘要：** ${summary || '暂缺可靠摘要。'}`,
    watchlistHeading: '### 观察列表',
    watchlistLine: (title, statusLabel, heat) => `- ${title}：${statusLabel} ｜ ${heat}`,
    followedHeading: '### 社区观察',
    followedLine: (category, title, score, heat) => `- ${category} ｜ ${title} ｜ 综合分 ${score} ｜ ${heat}`,
    pushTitle: '热点综合播报'
  },
  alert: {
    heading: label => `🔥 ${label}高热度即时预警`,
    rankHeat: (rank, heat) => `位次：#${rank} ｜ 热度：${heat}`,
    summary: summary => `摘要：${summary}`,
    viewDetails: '查看详情',
    trigger: rule => `触发规则：${rule}`,
    time: clock => `触发时间：${clock}`,
    rules: { both: '热度&位次规则', heat: '热度规则', rank: '位次规则' }
  },
  noSummary: '暂无摘要'
};
