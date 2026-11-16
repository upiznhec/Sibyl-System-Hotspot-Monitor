#!/usr/bin/env node

// Deployment self-check, kept from v1.3.20 with its four sections (required, recommended,
// optional, check by hand). It reads the config, the data folder and the crontab, and makes one
// request to see whether the internet can be reached (SIBYL_SKIP_NETWORK_CHECK=1 skips it); it sends nothing.

const fs = require('fs');
const path = require('path');
const https = require('https');

const { readModelSettings } = require('./lib/model-config');
const { isValidTimeZone, systemTimeZone } = require('./lib/locale');
const { everyText, loadPages, pageEveryHours, pageLateHours } = require('./lib/pages-file');
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
const { envFileIsPrivate, envFilePath, loadEnvFile } = require('./lib/env-file');
const { installedBlock, readCrontab } = require('./schedule');

const CHANNEL_LABELS = {
  wecom: 'WeCom',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram'
};

// Saved pages older than this are reported when there is no reading list (config.dailyPages).
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

// How a page on the reading list is named in the check.
function dailyPageName(page) {
  const label = sourceLabel(page.source);
  if (page.industry) return `${label}: ${page.industry}`;
  if (page.category) return `${label} category: ${page.category}`;
  if (page.keyword) return `${label} Explore: ${page.keyword}`;
  return label;
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
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
  // The agent's reading list (config.dailyPages): one line per page when it is set.
  const dailyPages = Array.isArray(config.dailyPages) ? config.dailyPages.filter(page => page?.source) : [];

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
      if (settings.pages !== false && !dailyPages.length) {
        [['trending', `${label} category page`], ['explore', `${label} Explore`]].forEach(([view, name]) => {
          const ages = pageAges(id, view);
          checkLine(recommended, 'recommended', name, fresh(ages), pagesDetail(ages),
            'Have your agent read this page and save it with scripts/save-pages.js (see AGENTS.md, "Reading the trend pages").');
        });
      }
      return;
    }
    if (id === 'tiktok-creative-center') {
      if (dailyPages.length) return;
      const ages = pageAges(id);
      checkLine(recommended, 'recommended', `${label} hashtags`, fresh(ages), pagesDetail(ages),
        'Have your agent read the Creative Center hashtag list in a browser once a day and save it with scripts/save-pages.js; without a login it shows the top 3.');
      return;
    }
    if (id === 'wikipedia') {
      const hasContact = /@|https?:\/\//.test(String(process.env.SIBYL_USER_AGENT || config.http?.userAgent || ''));
      checkLine(optional, 'optional', `${label} request contact`, hasContact,
        hasContact ? 'the user agent includes a contact' : 'the user agent has no contact',
        'Wikimedia asks automated tools to give a contact in the user agent: add your website or email in http.userAgent (or SIBYL_USER_AGENT). Sibyl sends it to Wikimedia only.');
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
        hasKey ? `API key set; searches about every ${settings.minIntervalMinutes ?? 60} minutes` : 'on, but no API key',
        'Set SIBYL_YOUTUBE_API_KEY (a free YouTube Data API v3 key; about 100 searches a day).');
      return;
    }
    if (id === 'x-trends') {
      const hasToken = Boolean(process.env.SIBYL_X_BEARER_TOKEN || settings.bearerToken);
      checkLine(optional, 'optional', label, hasToken,
        hasToken
          ? `bearer token set; requests about every ${settings.minIntervalMinutes ?? 10} minutes (about US$0.01 each)`
          : 'on, but no bearer token',
        'Set SIBYL_X_BEARER_TOKEN. The X developer account needs prepaid credits and is charged per request.');
    }
  });
  if (!dailyPages.length && enabled.some(id => id === 'google-trends' || id === 'tiktok-creative-center')) {
    checkLine(recommended, 'recommended', 'Daily reading list', false, 'dailyPages is not set',
      'After mapping the topics, write the pages to read as config.dailyPages (see AGENTS.md, "Mapping topics").');
  }
  const stalePages = [];
  dailyPages.forEach(page => {
    const view = page.source === 'google-trends' ? (page.view || 'trending') : null;
    const ages = pages.sections
      .filter(section => section.source === page.source)
      .filter(section => !view || (section.view || 'trending') === view)
      .filter(section => ['industry', 'category', 'keyword'].every(key => !page[key] || sameText(section[key], page[key])))
      .map(section => section.ageHours);
    const onTime = ages.length > 0 && Math.min(...ages) <= pageLateHours(page);
    const every = everyText(pageEveryHours(page));
    if (!onTime) stalePages.push(`${dailyPageName(page)} (${every})`);
    checkLine(recommended, 'recommended', dailyPageName(page), onTime, `${pagesDetail(ages)}; read ${every}`,
      'Have your agent read this page and save it with scripts/save-pages.js (see AGENTS.md, "Reading the trend pages").');
  });
  pages.problems
    .filter(problem => !/^no pages file/.test(problem))
    .forEach(problem => checkLine(recommended, 'recommended', 'pages.json', false, problem,
      'Have your agent read the pages again and save them in the format in lib/pages-file.js.'));
  return { dailyPageCount: dailyPages.length, stalePages };
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

// One request to Google Trends shows whether this computer, or the place an agent runs its commands,
// can reach the internet. Any answer counts; only a network error or no answer fails.
function checkInternet(host = 'trends.google.com', timeoutMs = 8000) {
  return new Promise(resolve => {
    const request = https.request({ host, path: '/', method: 'HEAD', timeout: timeoutMs }, response => {
      response.resume();
      resolve({ ok: true, detail: `${host} answered` });
    });
    request.on('timeout', () => request.destroy(new Error(`no answer within ${timeoutMs / 1000} seconds`)));
    request.on('error', error => resolve({ ok: false, detail: `${host}: ${error.message}` }));
    request.end();
  });
}

// The schedule installed by scripts/schedule.js (crontab), or null when there is none or it cannot be read.
function scheduleStatus() {
  if (process.platform === 'win32') return null;
  try {
    return installedBlock(readCrontab());
  } catch (error) {
    return null;
  }
}

async function main() {
  const dataDir = getDataDir();
  loadEnvFile(dataDir);
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

  if (process.env.SIBYL_SKIP_NETWORK_CHECK !== '1') {
    const internet = await checkInternet();
    checkLine(required, 'required', 'Internet access', internet.ok, internet.detail,
      'No source can be read without the internet. If an AI agent runs this, its commands may be kept offline ' +
      '(Codex does this by default): the agent must ask the person to allow network access, as AGENTS.md says ' +
      'under "What to ask, and when", and must not schedule anything until a collection succeeds.');
  }

  checkLine(recommended, 'recommended', 'Config file', fs.existsSync(configFile),
    configFile, 'On first setup, copy scripts/config.example.json to the data folder as config.json.');

  const envFile = envFilePath(dataDir);
  if (fs.existsSync(envFile)) {
    checkLine(recommended, 'recommended', 'Private settings file', envFileIsPrivate(dataDir),
      envFile, `Only your account should be able to read it: chmod 600 "${envFile}"`);
  }

  const alert = alertTarget(config);
  const report = reportTarget(config);
  const taskHasAlertWebhook = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHasReportWebhook = commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHint = 'Set a webhook (Slack, Discord or WeCom), or SIBYL_TELEGRAM_BOT_TOKEN and SIBYL_TELEGRAM_CHAT_ID for Telegram; with neither, briefings are saved as files. A webhook written only in the scheduled task command is not visible to this check: confirm it below or pass the command with --task-command.';

  // No push target and no task command: briefings and alerts are saved as files, a supported
  // setup, so one line says so instead of warnings about webhooks that are not meant to exist.
  const noPush = !maskStatus(alert.webhook) && !maskStatus(report.webhook);
  const keepDays = Number(config.archive?.keepDays) > 0 ? Number(config.archive.keepDays) : 7;
  if (noPush && !taskCommands) {
    checkLine(recommended, 'recommended', 'Push target', true,
      `none: briefings and alerts are saved as files and kept ${keepDays} days`, taskHint);
  } else {
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
  }

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

  const pageStatus = checkSources(config, dataDir, recommended, optional);

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

  if (!noPush || taskCommands) {
    checkLine(manual, 'manual', 'No double pushes', false,
      'check in your scheduler',
      'With --push the scripts call the webhook themselves; the scheduler should only run them on time, not send their output again.');
  }
  const schedule = scheduleStatus();
  checkLine(manual, 'manual', 'Scheduled tasks', Boolean(schedule),
    schedule ? 'installed by scripts/schedule.js (crontab)' : 'no schedule from scripts/schedule.js found',
    'Install it with: node scripts/schedule.js --install --hours=10-22 (the person\'s hours). On Windows it prints the Task Scheduler settings.');
  if (pageStatus.dailyPageCount > 0) {
    checkLine(manual, 'manual', 'Page reading', pageStatus.stalePages.length === 0,
      pageStatus.stalePages.length === 0
        ? 'every page on the reading list was read on time'
        : `late: ${pageStatus.stalePages.join('; ')}`,
      'Your agent reads these pages on a schedule (Google\'s Trending Now every hour during your hours, the others once a day), or when you ask: "Read the trend pages that are due for Sibyl." Outside your hours an hourly page is expected to be late. Until then the scripts use the last saved pages.');
  }
  if (!noPush || taskCommands) {
    checkLine(manual, 'manual', 'Webhooks in scheduled tasks', taskHasAlertWebhook && taskHasReportWebhook,
      taskCommands ? 'checked against the task command given' : 'no task command given; if the webhooks are only in the scheduled task, rely on its settings',
      'This check cannot read your scheduler\'s settings; pass the commands with --task-command or SIBYL_TASK_COMMANDS.');
  }

  const tips = [];
  if (noPush) {
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

main().catch(error => {
  console.error(`Self-check failed: ${error.message}`);
  process.exit(1);
});
