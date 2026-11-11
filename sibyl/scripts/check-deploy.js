#!/usr/bin/env node

// Deployment self-check, kept from v1.3.20 with its four sections (required, recommended,
// optional, check by hand). It reads the config and the data folder only; it sends nothing.

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
const {
  CHANNELS,
  alertTarget,
  detectChannel,
  reportTarget
} = require('./lib/webhook');

const CHANNEL_LABELS = {
  wecom: 'WeCom',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram'
};

// Saved pages older than this are reported: the agent should read them once a day.
const PAGES_STALE_HOURS = 30;

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

function checkLine(items, level, name, ok, detail, fix) {
  items.push({ level, name, ok: Boolean(ok), detail, fix });
}

// Which service a webhook posts to. Hosts other than Slack, Discord and Telegram get the WeCom
// format, so an unknown host without an explicit channel gets a warning.
function describeTarget(target) {
  if (target.channel && !CHANNELS[target.channel]) {
    return {
      ok: false,
      detail: `channel "${target.channel}" is not valid; use one of: ${Object.keys(CHANNELS).join(', ')}`
    };
  }
  let host = '';
  try {
    host = new URL(target.webhook).hostname;
  } catch (e) {
    return { ok: false, detail: 'the webhook address cannot be read' };
  }
  const channel = detectChannel(target.webhook, target.channel);
  if (channel === 'telegram') {
    const url = new URL(target.webhook);
    const tokenOk = /^\/bot\d+:[\w-]{20,}\/sendMessage$/.test(url.pathname);
    const chatOk = Boolean(url.searchParams.get('chat_id'));
    return {
      ok: tokenOk && chatOk,
      detail: tokenOk && chatOk
        ? 'Telegram (bot and chat ID set)'
        : `Telegram setting incomplete:${tokenOk ? '' : ' the bot token does not look right;'}${chatOk ? '' : ' no chat ID'}`
    };
  }
  const known = Boolean(target.channel) ||
    channel !== 'wecom' ||
    /(^|\.)qyapi\.weixin\.qq\.com$/i.test(host);
  return {
    ok: known,
    detail: known
      ? `${CHANNEL_LABELS[channel]} (${host}${target.channel ? ', set by channel' : ''})`
      : `unknown address ${host}; it will get the WeCom format`
  };
}

function platformsConfig(config) {
  const merged = defaultPlatformsConfig();
  Object.entries(config.platforms || {}).forEach(([id, value]) => {
    merged[id] = { ...(merged[id] || {}), ...(value || {}) };
  });
  return merged;
}

function pagesDetail(ages) {
  return ages.length
    ? `${ages.length} saved in pages.json, the newest read ${Math.min(...ages)} hours ago`
    : 'not in pages.json yet';
}

// One line per switched-on source: what it needs and whether that is in place.
function checkSources(config, dataDir, recommended, optional) {
  const platforms = platformsConfig(config);
  const enabled = Object.keys(platforms).filter(id => platforms[id]?.enabled && getSource(id));
  const seeds = Array.isArray(config.report?.seedPlatforms) && config.report.seedPlatforms.length
    ? config.report.seedPlatforms
    : defaultSeedPlatforms(platforms);
  const pages = loadPages(config, dataDir);
  const pageAges = (source, view = null) => pages.sections
    .filter(section => section.source === source && (!view || (section.view || 'trending') === view))
    .map(section => section.ageHours);
  const fresh = ages => ages.length > 0 && Math.min(...ages) <= PAGES_STALE_HOURS;

  checkLine(recommended, 'recommended', 'Main sources', seeds.length > 0 && seeds.every(id => enabled.includes(id)),
    seeds.map(sourceLabel).join(', ') || 'none',
    'Main sources must be switched on (enabled: true under platforms); see report.seedPlatforms.');

  enabled.forEach(id => {
    const settings = platforms[id] || {};
    const label = sourceLabel(id);
    if (id === 'google-trends') {
      checkLine(recommended, 'recommended', `${label} RSS`, settings.rss !== false,
        settings.rss !== false
          ? `read by the script on every run (country ${String(settings.geo || config.country || 'US').toUpperCase()})`
          : 'off',
        'The RSS feed is where instant alerts come from; keep it on (platforms["google-trends"].rss).');
      if (settings.pages !== false) {
        [['trending', `${label} category page`], ['explore', `${label} Explore`]].forEach(([view, name]) => {
          const ages = pageAges(id, view);
          checkLine(recommended, 'recommended', name, fresh(ages), pagesDetail(ages),
            'Have your agent read this page once a day and save it to pages.json (format in lib/pages-file.js).');
        });
      }
      return;
    }
    if (id === 'tiktok-creative-center') {
      const ages = pageAges(id);
      checkLine(recommended, 'recommended', `${label} hashtags`, fresh(ages), pagesDetail(ages),
        'Have your agent read the Creative Center hashtag list in a browser once a day and save it to pages.json; without a login it shows the top 3.');
      return;
    }
    if (id === 'wikipedia') {
      const hasContact = /@|https?:\/\//.test(String(process.env.SIBYL_USER_AGENT || config.http?.userAgent || ''));
      checkLine(optional, 'optional', `${label} request contact`, hasContact,
        hasContact ? 'the user agent includes a contact' : 'the user agent has no contact',
        'Wikimedia asks automated tools to give a contact in the user agent: add your website or email in http.userAgent (or SIBYL_USER_AGENT).');
      return;
    }
    if (id === 'youtube-channels' || id === 'rss') {
      const list = id === 'rss' ? settings.feeds : settings.channels;
      const count = Array.isArray(list) ? list.length : 0;
      checkLine(optional, 'optional', label, count > 0,
        count > 0 ? `following ${count} ${id === 'rss' ? 'site(s)' : 'channel(s)'}` : 'on, but nothing is listed',
        id === 'rss'
          ? 'List feed addresses in platforms.rss.feeds. Some sites allow their feeds for personal use only; check before adding one.'
          : 'List channel IDs (they start with UC) in platforms["youtube-channels"].channels.');
      return;
    }
    if (id === 'youtube-search') {
      const hasKey = Boolean(process.env.SIBYL_YOUTUBE_API_KEY || settings.apiKey);
      checkLine(optional, 'optional', label, hasKey,
        hasKey ? `API key set; searches at most every ${settings.minIntervalMinutes ?? 60} minutes` : 'on, but no API key',
        'Set SIBYL_YOUTUBE_API_KEY (a free YouTube Data API v3 key; about 100 searches a day).');
      return;
    }
    if (id === 'x-trends') {
      const hasToken = Boolean(process.env.SIBYL_X_BEARER_TOKEN || settings.bearerToken);
      checkLine(optional, 'optional', label, hasToken,
        hasToken
          ? `bearer token set; requests at most every ${settings.minIntervalMinutes ?? 30} minutes (about US$0.01 each)`
          : 'on, but no bearer token',
        'Set SIBYL_X_BEARER_TOKEN. The X developer account needs prepaid credits and is charged per request.');
    }
  });
  pages.problems
    .filter(problem => !/^no pages file/.test(problem))
    .forEach(problem => checkLine(recommended, 'recommended', 'pages.json', false, problem,
      'Have your agent read the pages again and save them in the format in lib/pages-file.js.'));
}

function statusIcon(item) {
  if (item.ok) return 'OK';
  return item.level === 'required' ? 'MISS' : 'WARN';
}

function printSection(title, items) {
  console.log(`\n## ${title}`);
  items.forEach(item => {
    console.log(`- [${statusIcon(item)}] ${item.name}: ${item.detail}`);
    if (!item.ok && item.fix) console.log(`  Fix: ${item.fix}`);
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

  checkLine(required, 'required', 'Sibyl folder', fs.existsSync(path.resolve(__dirname, '..')),
    path.resolve(__dirname, '..'), 'Make sure the whole sibyl folder was downloaded.');

  checkLine(required, 'required', 'Node.js', Boolean(process.version),
    process.version, 'Install Node.js, then run Sibyl.');

  checkLine(required, 'required', 'Data folder', fs.existsSync(dataDir),
    dataDir, `Create it: mkdir -p ${dataDir}`);

  checkLine(recommended, 'recommended', 'Config file', fs.existsSync(configFile),
    configFile, 'On first setup, copy scripts/config.example.json to the data folder as config.json.');

  const alert = alertTarget(config);
  const report = reportTarget(config);
  const taskHasAlertWebhook = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHasReportWebhook = commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHint = 'Set a webhook (Slack, Discord or WeCom), or SIBYL_TELEGRAM_BOT_TOKEN and SIBYL_TELEGRAM_CHAT_ID for Telegram; with neither, briefings are saved as files. A webhook written only in the scheduled task command is not visible to this check: confirm it below or pass the command with --task-command.';

  checkLine(recommended, 'recommended', 'Alert push target', maskStatus(alert.webhook),
    maskStatus(alert.webhook) ? 'set in the environment or config' : 'not set', taskHint);
  if (maskStatus(alert.webhook)) {
    const target = describeTarget(alert);
    checkLine(recommended, 'recommended', 'Alert channel', target.ok, target.detail,
      'Slack, Discord and Telegram are recognised by their address; for any other address (a relay, for example), set alerts.channel to wecom, slack, discord or telegram.');
  }

  checkLine(recommended, 'recommended', 'Briefing push target', maskStatus(report.webhook),
    maskStatus(report.webhook) ? 'set in the environment or config' : 'not set', taskHint);
  if (maskStatus(report.webhook)) {
    const target = describeTarget(report);
    checkLine(recommended, 'recommended', 'Briefing channel', target.ok, target.detail,
      'Slack, Discord and Telegram are recognised by their address; for any other address (a relay, for example), set report.channel to wecom, slack, discord or telegram.');
  }

  checkLine(recommended, 'recommended', 'Alert webhook in the scheduled task', taskHasAlertWebhook,
    taskHasAlertWebhook ? 'SIBYL_ALERT_WEBHOOK or WECOM_WEBHOOK found in the task command' : 'no task command given, so this cannot be checked',
    'Run: node scripts/check-deploy.js --task-command="export SIBYL_ALERT_WEBHOOK=... && node scripts/instant-alerts.js --push"');

  checkLine(recommended, 'recommended', 'Briefing webhook in the scheduled task', taskHasReportWebhook,
    taskHasReportWebhook ? 'SIBYL_REPORT_WEBHOOK or WECOM_WEBHOOK found in the task command' : 'no task command given, so this cannot be checked',
    'Run: node scripts/check-deploy.js --task-command="export SIBYL_REPORT_WEBHOOK=... && node scripts/sibyl.js --push"');

  const splitInProcess = maskStatus(process.env.SIBYL_ALERT_WEBHOOK) && maskStatus(process.env.SIBYL_REPORT_WEBHOOK);
  const splitInTask = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK']) &&
    commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK']);
  checkLine(recommended, 'recommended', 'Separate alert and briefing webhooks', splitInProcess || splitInTask,
    splitInProcess || splitInTask
      ? 'alerts and briefings go to separate webhooks'
      : 'separate SIBYL_ALERT_WEBHOOK and SIBYL_REPORT_WEBHOOK not both found',
    'Set SIBYL_ALERT_WEBHOOK and SIBYL_REPORT_WEBHOOK separately; WECOM_WEBHOOK is only a shared fallback.');

  const model = readModelSettings(config);
  const hasModelKey = maskStatus(model.apiKey);
  checkLine(optional, 'optional', 'AI model key', hasModelKey,
    hasModelKey ? `set (from ${model.keyFrom})` : 'not set',
    'Set SIBYL_AI_API_KEY (preferred) or config.ai.apiKey. Without it, event merging and summaries use the rule-based fallback.');
  if (hasModelKey) {
    let apiHost = '';
    try {
      apiHost = new URL(model.baseUrl).host;
    } catch (e) {
      apiHost = '';
    }
    checkLine(optional, 'optional', 'AI model', Boolean(model.model) && Boolean(apiHost),
      `${model.model || 'no model name'} (API ${apiHost || 'address cannot be read'})`,
      'Set SIBYL_AI_MODEL or config.ai.model. The API is OpenAI by default; for another compatible API set SIBYL_AI_BASE_URL or config.ai.baseUrl. With a key but no model name, the AI steps stay off.');
  }

  const topicSettings = loadTopicSettings(config, configFile);
  const keywordCount = topicSettings.categories.reduce((sum, topic) => sum + topic.keywords.length, 0);
  checkLine(recommended, 'recommended', 'Topics', Boolean(config.topics) && keywordCount > 0,
    config.topics
      ? `${topicSettings.categoryNames.length} topic(s) (${topicSettings.categoryNames.join(', ')}), ${keywordCount} keywords`
      : `not set; using the example topic (${topicSettings.categoryNames.join(', ')})`,
    'Have your agent draft topics, keywords and exclude words from what you want to track; after you confirm them, it writes them to config.topics.');

  checkSources(config, dataDir, recommended, optional);

  // Briefing times use config.timeZone; cron runs on the computer's own zone.
  const timezone = readTimezone();
  const systemZone = timezone.intl || systemTimeZone();
  const configuredZone = config.timeZone || '';
  const zoneValid = !configuredZone || isValidTimeZone(configuredZone);
  const zoneMatches = !configuredZone || configuredZone === systemZone;
  checkLine(recommended, 'recommended', 'Time zone', zoneValid && zoneMatches,
    !zoneValid
      ? `timeZone "${configuredZone}" is not valid; the computer's zone ${systemZone} is used`
      : `briefing times in ${configuredZone || systemZone}${configuredZone ? '' : ' (the computer\'s zone)'}; computer's zone ${systemZone}`,
    zoneValid
      ? `Scheduled tasks run on the computer's zone; convert the task times to ${configuredZone || systemZone}, or set timeZone to the computer's zone.`
      : 'Use an IANA zone name for timeZone, such as America/New_York, Europe/London or Asia/Singapore.');

  checkLine(manual, 'manual', 'No double pushes', false,
    'check in your scheduler',
    'With --push the scripts call the webhook themselves; the scheduler should only run them on time, not send their output again.');
  checkLine(manual, 'manual', 'Scheduled tasks', false,
    'check in crontab or your scheduler',
    'Within your chosen hours: every 10 minutes run collect-snapshot and instant-alerts; every hour run sibyl.js --push.');
  checkLine(manual, 'manual', 'Daily page reading', false,
    'check that your agent reads the TikTok and Google Trends pages once a day',
    'The agent reads the hashtag list, the category page and Explore, and writes pages.json; when it has not, the scripts use the last saved pages.');
  checkLine(manual, 'manual', 'Webhooks in scheduled tasks', taskHasAlertWebhook && taskHasReportWebhook,
    taskCommands ? 'checked against the task command given' : 'no task command given; if the webhooks are only in the scheduled task, rely on its settings',
    'This check cannot read your scheduler\'s settings; pass the commands with --task-command or SIBYL_TASK_COMMANDS.');

  const tips = [];
  if (!maskStatus(alert.webhook) && !maskStatus(report.webhook)) {
    const keepDays = Number(config.archive?.keepDays) > 0 ? Number(config.archive.keepDays) : 7;
    tips.push(`No push is set: briefings and instant alerts are saved as files (${path.join(dataDir, 'briefings')}, ${path.join(dataDir, 'alerts')}, kept ${keepDays} days) and nothing is sent.`);
    tips.push(`To read them, ask your agent, for example: "${ASK_EXAMPLES.join('", "')}". The agent runs node scripts/show-briefing.js and shows a briefing only when you ask.`);
  }

  console.log('# Sibyl System deployment check');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`Data folder: ${dataDir}`);
  console.log(`Config file: ${configFile}`);

  printSection('Required', required);
  printSection('Recommended', recommended);
  printSection('Optional', optional);
  printSection('Check by hand', manual);
  if (tips.length) {
    console.log('\n## Reading briefings');
    tips.forEach(tip => console.log(`- ${tip}`));
  }

  const missingRequired = required.filter(item => !item.ok).length;
  const warnings = recommended.filter(item => !item.ok).length + optional.filter(item => !item.ok).length;
  console.log(`\nResult: ${missingRequired} required item(s) missing, ${warnings} warning(s).`);

  if (missingRequired > 0 && process.argv.includes('--strict')) process.exit(1);
}

main();
