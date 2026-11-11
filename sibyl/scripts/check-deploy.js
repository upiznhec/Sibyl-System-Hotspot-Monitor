#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { readModelSettings } = require('./lib/model-config');
const { isValidTimeZone, systemTimeZone } = require('./lib/locale');
const { loadPages } = require('./lib/pages-file');
const { loadTopicSettings } = require('./lib/topic-settings');
const {
  defaultPlatformsConfig,
  defaultSeedPlatforms,
  getSource,
  sourceLabel
} = require('./lib/source-registry');

// Saved pages older than this are reported: the agent should read them once a day.
const PAGES_STALE_HOURS = 30;

function platformsConfig(config) {
  const merged = defaultPlatformsConfig();
  Object.entries(config.platforms || {}).forEach(([id, value]) => {
    merged[id] = { ...(merged[id] || {}), ...(value || {}) };
  });
  return merged;
}

// One line per switched-on source: what it needs and whether that is in place.
function checkSources(config, dataDir, recommended, optional) {
  const platforms = platformsConfig(config);
  const enabled = Object.keys(platforms).filter(id => platforms[id]?.enabled && getSource(id));
  const seeds = Array.isArray(config.report?.seedPlatforms) && config.report.seedPlatforms.length
    ? config.report.seedPlatforms
    : defaultSeedPlatforms(platforms);
  const pages = loadPages(config, dataDir);
  const pageAge = (source, view = null) => pages.sections
    .filter(section => section.source === source && (!view || (section.view || 'trending') === view))
    .map(section => section.ageHours);

  checkLine(recommended, 'recommended', '主来源', seeds.length > 0 && seeds.every(id => enabled.includes(id)),
    seeds.map(sourceLabel).join('、') || '无',
    '主来源必须是已开启的来源（platforms 中 enabled: true），见 report.seedPlatforms。');

  enabled.forEach(id => {
    const settings = platforms[id] || {};
    const label = sourceLabel(id);
    if (id === 'google-trends') {
      checkLine(recommended, 'recommended', `${label} RSS`, settings.rss !== false,
        settings.rss !== false ? `脚本每次运行读取（国家 ${String(settings.geo || config.country || 'US').toUpperCase()}）` : '已关闭',
        'RSS 是即时预警的来源，建议保持开启（platforms["google-trends"].rss）。');
      if (settings.pages !== false) {
        ['trending', 'explore'].forEach(view => {
          const ages = pageAge(id, view);
          const name = view === 'trending' ? `${label} 类别页面` : `${label} Explore`;
          checkLine(recommended, 'recommended', name, ages.length > 0 && Math.min(...ages) <= PAGES_STALE_HOURS,
            ages.length ? `pages.json 中 ${ages.length} 段，最近一次 ${Math.min(...ages)} 小时前读取` : 'pages.json 中还没有',
            '让 agent 每天读取一次该页面并写入 pages.json（见 lib/pages-file.js 的格式）。');
        });
      }
      return;
    }
    if (id === 'tiktok-creative-center') {
      const ages = pageAge(id);
      checkLine(recommended, 'recommended', `${label} 话题标签榜`, ages.length > 0 && Math.min(...ages) <= PAGES_STALE_HOURS,
        ages.length ? `pages.json 中 ${ages.length} 段，最近一次 ${Math.min(...ages)} 小时前读取` : 'pages.json 中还没有',
        '让 agent 每天在浏览器里读取一次 Creative Center 话题标签榜并写入 pages.json；不登录只显示前 3 名。');
      return;
    }
    if (id === 'wikipedia') {
      const hasContact = /@|https?:\/\//.test(String(process.env.SIBYL_USER_AGENT || config.http?.userAgent || ''));
      checkLine(optional, 'optional', `${label} 请求标识`, hasContact,
        hasContact ? '已包含联系方式' : '未包含联系方式',
        'Wikimedia 要求自动程序在 user-agent 中写明联系方式：在 http.userAgent（或 SIBYL_USER_AGENT）中加上你的网址或邮箱。');
      return;
    }
    if (id === 'youtube-channels' || id === 'rss') {
      const list = id === 'rss' ? settings.feeds : settings.channels;
      const count = Array.isArray(list) ? list.length : 0;
      checkLine(optional, 'optional', label, count > 0,
        count > 0 ? `已关注 ${count} 个${id === 'rss' ? '网站' : '频道'}` : '已开启，但没有填写',
        id === 'rss'
          ? '在 platforms.rss.feeds 中填写网站的 RSS 地址；有的网站只允许个人使用其 RSS，添加前看一下条款。'
          : '在 platforms["youtube-channels"].channels 中填写频道 ID（以 UC 开头）。');
      return;
    }
    if (id === 'youtube-search') {
      const hasKey = Boolean(process.env.SIBYL_YOUTUBE_API_KEY || settings.apiKey);
      checkLine(optional, 'optional', label, hasKey,
        hasKey ? `已设置 API key，每 ${settings.minIntervalMinutes ?? 60} 分钟最多搜索一次` : '已开启，但没有 API key',
        '设置 SIBYL_YOUTUBE_API_KEY（YouTube Data API v3 的免费 key；搜索每天约 100 次）。');
      return;
    }
    if (id === 'x-trends') {
      const hasToken = Boolean(process.env.SIBYL_X_BEARER_TOKEN || settings.bearerToken);
      checkLine(optional, 'optional', label, hasToken,
        hasToken ? `已设置 bearer token，每 ${settings.minIntervalMinutes ?? 30} 分钟最多请求一次（每次请求约 0.01 美元）` : '已开启，但没有 bearer token',
        '设置 SIBYL_X_BEARER_TOKEN；X 的开发者账号需要预充值，按请求次数扣费。');
    }
  });
  pages.problems
    .filter(problem => !/^no pages file/.test(problem))
    .forEach(problem => checkLine(recommended, 'recommended', 'pages.json', false, problem,
      '让 agent 重新读取页面并按 lib/pages-file.js 的格式保存。'));
}
const {
  CHANNELS,
  alertTarget,
  detectChannel,
  reportTarget
} = require('./lib/webhook');

const CHANNEL_LABELS = {
  wecom: '企业微信',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram'
};

// What a person can ask their agent when briefings are saved as files instead of sent.
const ASK_EXAMPLES = [
  'Show me the latest trend briefing',
  'Any trend alerts today?',
  'What were the top trends yesterday afternoon?'
];

function getDataDir() {
  if (process.env.SIBYL_DATA_DIR) return process.env.SIBYL_DATA_DIR;
  return path.resolve(__dirname, '..', 'data');
}

function readJson(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
  return fallback;
}

function maskStatus(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/YOUR_KEY|ALERT_KEY|REPORT_KEY/i.test(text)) return false;
  return true;
}

function argValues(prefix) {
  return process.argv
    .filter(arg => arg.startsWith(prefix))
    .map(arg => arg.slice(prefix.length))
    .filter(Boolean);
}

function taskCommandText(config = {}) {
  const fromArgs = argValues('--task-command=');
  const fromEnv = process.env.SIBYL_TASK_COMMANDS
    ? [process.env.SIBYL_TASK_COMMANDS]
    : [];
  const fromConfig = Array.isArray(config.deployment?.taskCommands)
    ? config.deployment.taskCommands
    : [];
  return [...fromArgs, ...fromEnv, ...fromConfig].join('\n');
}

function commandHasVariable(commandText, names) {
  const text = String(commandText || '');
  return names.some(name => new RegExp(`(?:^|[\\s;"'])${name}=`, 'm').test(text));
}

// Which service a webhook posts to. Hosts other than Slack and Discord get the WeCom format,
// so an unknown host without an explicit channel gets a warning.
function describeTarget(target) {
  if (target.channel && !CHANNELS[target.channel]) {
    return {
      ok: false,
      detail: `channel "${target.channel}" 无效，可用值：${Object.keys(CHANNELS).join('、')}`
    };
  }
  let host = '';
  try {
    host = new URL(target.webhook).hostname;
  } catch (e) {
    return { ok: false, detail: 'webhook 地址无法解析' };
  }
  const channel = detectChannel(target.webhook, target.channel);
  if (channel === 'telegram') {
    const url = new URL(target.webhook);
    const tokenOk = /^\/bot\d+:[\w-]{20,}\/sendMessage$/.test(url.pathname);
    const chatOk = Boolean(url.searchParams.get('chat_id'));
    return {
      ok: tokenOk && chatOk,
      detail: tokenOk && chatOk
        ? 'Telegram（机器人和聊天 ID 已设置）'
        : `Telegram 设置不完整：${tokenOk ? '' : '机器人 token 格式不对；'}${chatOk ? '' : '缺少聊天 ID'}`
    };
  }
  const known = Boolean(target.channel) ||
    channel !== 'wecom' ||
    /(^|\.)qyapi\.weixin\.qq\.com$/i.test(host);
  return {
    ok: known,
    detail: known
      ? `${CHANNEL_LABELS[channel]}（${host}${target.channel ? '，按 channel 设置' : ''}）`
      : `未识别的地址 ${host}，将按企业微信格式发送`
  };
}

function checkLine(items, level, name, ok, detail, fix) {
  items.push({ level, name, ok: Boolean(ok), detail, fix });
}

function statusIcon(item) {
  if (item.ok) return 'OK';
  return item.level === 'required' ? 'MISS' : 'WARN';
}

function printSection(title, items) {
  console.log(`\n## ${title}`);
  items.forEach(item => {
    console.log(`- [${statusIcon(item)}] ${item.name}: ${item.detail}`);
    if (!item.ok && item.fix) console.log(`  建议：${item.fix}`);
  });
}

function readTimezone() {
  const result = {
    intl: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    timezoneFile: '',
    localtime: ''
  };

  try {
    result.timezoneFile = fs.readFileSync('/etc/timezone', 'utf8').trim();
  } catch (e) {
    result.timezoneFile = '';
  }

  try {
    result.localtime = fs.readlinkSync('/etc/localtime');
  } catch (e) {
    result.localtime = '';
  }

  return result;
}

function main() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  const config = readJson(configFile, {});
  const taskCommands = taskCommandText(config);

  const required = [];
  const recommended = [];
  const optional = [];
  const manual = [];

  checkLine(required, 'required', 'Sibyl 目录', fs.existsSync(path.resolve(__dirname, '..')),
    path.resolve(__dirname, '..'), '确认 sibyl 目录已完整下载。');

  checkLine(required, 'required', 'Node.js', Boolean(process.version),
    process.version, '安装 Node.js 后再运行 Sibyl。');

  checkLine(required, 'required', '数据目录', fs.existsSync(dataDir),
    dataDir, `创建目录：mkdir -p ${dataDir}`);

  checkLine(recommended, 'recommended', 'Sibyl 配置文件', fs.existsSync(configFile),
    configFile, '首次部署可从 scripts/config.example.json 复制到数据目录。');

  const alert = alertTarget(config);
  const report = reportTarget(config);
  const taskHasAlertWebhook = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHasReportWebhook = commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHint = '设置 webhook（Slack、Discord、企业微信），或用 SIBYL_TELEGRAM_BOT_TOKEN 和 SIBYL_TELEGRAM_CHAT_ID 推送到 Telegram；都不设置时播报存成文件。如果 webhook 只写在定时任务命令里，手动运行自检时读不到，可在下方人工确认或用 --task-command 传入任务命令。';

  checkLine(recommended, 'recommended', '当前进程即时预警 webhook', maskStatus(alert.webhook),
    maskStatus(alert.webhook) ? '当前进程/配置可读取' : '当前进程未检测到', taskHint);
  if (maskStatus(alert.webhook)) {
    const target = describeTarget(alert);
    checkLine(recommended, 'recommended', '即时预警推送渠道', target.ok, target.detail,
      'Slack 和 Discord 按地址自动识别；经代理转发等其他地址，请在 alerts.channel 中写明 wecom、slack 或 discord。');
  }

  checkLine(recommended, 'recommended', '当前进程综合播报 webhook', maskStatus(report.webhook),
    maskStatus(report.webhook) ? '当前进程/配置可读取' : '当前进程未检测到', taskHint);
  if (maskStatus(report.webhook)) {
    const target = describeTarget(report);
    checkLine(recommended, 'recommended', '综合播报推送渠道', target.ok, target.detail,
      'Slack 和 Discord 按地址自动识别；经代理转发等其他地址，请在 report.channel 中写明 wecom、slack 或 discord。');
  }

  checkLine(recommended, 'recommended', '定时任务即时预警 webhook', taskHasAlertWebhook,
    taskHasAlertWebhook ? '任务命令中检测到 SIBYL_ALERT_WEBHOOK 或 WECOM_WEBHOOK' : '未传入任务命令，无法自动判断',
    '可运行：node scripts/check-deploy.js --task-command="export SIBYL_ALERT_WEBHOOK=... && node scripts/instant-alerts.js --push"。');

  checkLine(recommended, 'recommended', '定时任务综合播报 webhook', taskHasReportWebhook,
    taskHasReportWebhook ? '任务命令中检测到 SIBYL_REPORT_WEBHOOK 或 WECOM_WEBHOOK' : '未传入任务命令，无法自动判断',
    '可运行：node scripts/check-deploy.js --task-command="export SIBYL_REPORT_WEBHOOK=... && node scripts/sibyl.js --push"。');

  const splitInProcess = maskStatus(process.env.SIBYL_ALERT_WEBHOOK) && maskStatus(process.env.SIBYL_REPORT_WEBHOOK);
  const splitInTask = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK']) &&
    commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK']);
  checkLine(recommended, 'recommended', 'webhook 拆分', splitInProcess || splitInTask,
    splitInProcess || splitInTask
      ? '已检测到即时预警和综合播报分开配置'
      : '当前进程或传入任务命令中未同时检测到两个专用 webhook',
    '推荐分别配置 SIBYL_ALERT_WEBHOOK 和 SIBYL_REPORT_WEBHOOK，WECOM_WEBHOOK 只做兜底。');

  const model = readModelSettings(config);
  const hasModelKey = maskStatus(model.apiKey);
  checkLine(optional, 'optional', 'AI 模型密钥', hasModelKey,
    hasModelKey ? `已配置（来自 ${model.keyFrom}）` : '未配置',
    '设置环境变量 SIBYL_AI_API_KEY（推荐），或写入 config.ai.apiKey；未配置时事件合并、相关性判断和摘要使用规则兜底。');
  if (hasModelKey) {
    let apiHost = '';
    try {
      apiHost = new URL(model.baseUrl).host;
    } catch (e) {
      apiHost = '';
    }
    checkLine(optional, 'optional', 'AI 模型', Boolean(model.model) && Boolean(apiHost),
      `${model.model || '模型名称未配置'}（接口 ${apiHost || '地址无法解析'}）`,
      '设置 SIBYL_AI_MODEL 或 config.ai.model；接口默认 OpenAI，其他兼容接口设置 SIBYL_AI_BASE_URL 或 config.ai.baseUrl。只有密钥没有模型名称时，AI 步骤不会启用。');
  }

  const topicSettings = loadTopicSettings(config, configFile);
  const keywordCount = topicSettings.categories.reduce((sum, topic) => sum + topic.keywords.length, 0);
  checkLine(recommended, 'recommended', '领域', Boolean(config.topics) && keywordCount > 0,
    config.topics
      ? `${topicSettings.categoryNames.length} 个领域（${topicSettings.categoryNames.join('、')}），关键词 ${keywordCount} 个`
      : `未设置，正在使用示例领域（${topicSettings.categoryNames.join('、')}）`,
    '让 agent 根据你的需求起草领域、关键词和排除词，你确认后写入 config.topics。');

  checkSources(config, dataDir, recommended, optional);

  // Briefing times use config.timeZone; cron runs on the computer's own zone.
  const timezone = readTimezone();
  const systemZone = timezone.intl || systemTimeZone();
  const configuredZone = config.timeZone || '';
  const zoneValid = !configuredZone || isValidTimeZone(configuredZone);
  const zoneMatches = !configuredZone || configuredZone === systemZone;
  checkLine(recommended, 'recommended', '时区', zoneValid && zoneMatches,
    !zoneValid
      ? `timeZone "${configuredZone}" 无效，将使用系统时区 ${systemZone}`
      : `播报时间按 ${configuredZone || systemZone}${configuredZone ? '' : '（系统时区）'} 显示；系统时区 ${systemZone}`,
    zoneValid
      ? `定时任务按系统时区运行；把任务时间换算到 ${configuredZone || systemZone}，或把 timeZone 设成系统时区。`
      : 'timeZone 用 IANA 名称，例如 America/New_York、Europe/London、Asia/Singapore。');

  checkLine(manual, 'manual', '避免重复推送', false,
    '需要在调度工具中人工确认',
    '脚本带 --push 时自己调用 webhook；调度工具只负责按时运行，不要再把运行结果另发一次。');
  checkLine(manual, 'manual', '定时任务', false,
    '需要在 crontab 或其他调度工具中人工确认',
    '在你设定的时段内每10分钟运行 collect-snapshot + instant-alerts；每小时运行 sibyl.js --push。');
  checkLine(manual, 'manual', '每天读网页', false,
    '需要确认 agent 每天读取一次 TikTok 和 Google Trends 页面',
    'agent 读取话题标签榜、类别页面和 Explore，写入 pages.json；没读时脚本沿用上一次的结果。');
  checkLine(manual, 'manual', '定时任务中的 webhook', taskHasAlertWebhook && taskHasReportWebhook,
    taskCommands ? '已根据传入任务命令做辅助检查' : '未传入任务命令；若 webhook 只写在定时任务里，请以任务配置为准',
    '自检脚本读不到调度工具里的任务配置；可用 --task-command 或 SIBYL_TASK_COMMANDS 辅助检查。');

  const tips = [];
  if (!maskStatus(alert.webhook) && !maskStatus(report.webhook)) {
    const keepDays = Number(config.archive?.keepDays) > 0 ? Number(config.archive.keepDays) : 7;
    tips.push(`未设置推送：播报和即时预警会存成文件（${path.join(dataDir, 'briefings')}、${path.join(dataDir, 'alerts')}，保留 ${keepDays} 天），不会主动发出。`);
    tips.push(`想看时问你的 agent，例如："${ASK_EXAMPLES.join('"、"')}"。agent 会运行 node scripts/show-briefing.js，只在你问的时候展示。`);
  }

  console.log('# Sibyl System 部署自检');
  console.log(`运行时间：${new Date().toISOString()}`);
  console.log(`数据目录：${dataDir}`);
  console.log(`配置文件：${configFile}`);

  printSection('必需项', required);
  printSection('推荐项', recommended);
  printSection('可选增强', optional);
  printSection('人工确认', manual);
  if (tips.length) {
    console.log('\n## 使用提示');
    tips.forEach(tip => console.log(`- ${tip}`));
  }

  const missingRequired = required.filter(item => !item.ok).length;
  const warnings = recommended.filter(item => !item.ok).length + optional.filter(item => !item.ok).length;
  console.log(`\n结论：必需缺失 ${missingRequired} 项，提醒 ${warnings} 项。`);

  if (missingRequired > 0 && process.argv.includes('--strict')) process.exit(1);
}

main();
