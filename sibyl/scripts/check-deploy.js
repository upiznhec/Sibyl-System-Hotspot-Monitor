#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  healthFile,
  listCapabilities,
  loadHealthState
} = require('./lib/retrieval-health');

const DEFAULT_WEIBO_WIS_AUTH_URL = 'https://open-im.api.weibo.com/open/auth/ws_token';
const DEFAULT_WEIBO_WIS_SEARCH_URL = 'https://open-im.api.weibo.com/open/wis/search_query';
const DEFAULT_RETRIEVAL_CAPABILITIES = [
  'openclaw.agent.sibyl-retriever',
  'browser.search',
  'web_fetch.read',
];

function getDataDir() {
  if (process.env.SIBYL_DATA_DIR) return process.env.SIBYL_DATA_DIR;
  const openclawWorkspace = '/root/.openclaw/workspace';
  if (fs.existsSync(openclawWorkspace)) {
    return path.join(openclawWorkspace, 'data', 'sibyl');
  }
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
  if (/YOUR_KEY|ALERT_KEY|REPORT_KEY|WEIBO_APP_ID|WEIBO_APP_SECRET/i.test(text)) return false;
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
  const fromEnv = process.env.SIBYL_OPENCLAW_TASK_COMMANDS
    ? [process.env.SIBYL_OPENCLAW_TASK_COMMANDS]
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

function openclawConfig() {
  return readJson('/root/.openclaw/openclaw.json', {});
}

function commandExists(command) {
  if (!command || command.includes(path.sep)) {
    try {
      fs.accessSync(command, fs.constants.X_OK);
      return true;
    } catch (e) {
      return false;
    }
  }
  return String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .some(dir => {
      try {
        fs.accessSync(path.join(dir, command), fs.constants.X_OK);
        return true;
      } catch (e) {
        return false;
      }
    });
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
  const openclaw = openclawConfig();
  const weiboAI = config.alerts?.weiboAI || {};
  const openclawWeibo = openclaw.channels?.weibo || {};
  const modelConfig = config.ai || openclaw.models?.providers?.aliyun || {};
  const taskCommands = taskCommandText(config);

  const required = [];
  const recommended = [];
  const optional = [];
  const manual = [];

  checkLine(required, 'required', 'Sibyl 技能目录', fs.existsSync(path.resolve(__dirname, '..')),
    path.resolve(__dirname, '..'), '确认已将 sibyl 目录放入 OpenClaw skills 目录。');

  checkLine(required, 'required', 'Node.js', Boolean(process.version),
    process.version, '安装 Node.js 后再运行 Sibyl。');

  checkLine(required, 'required', '数据目录', fs.existsSync(dataDir),
    dataDir, `创建目录：mkdir -p ${dataDir}`);

  checkLine(recommended, 'recommended', 'Sibyl 配置文件', fs.existsSync(configFile),
    configFile, '首次部署可从 scripts/config.example.json 复制到数据目录。');

  const alertWebhook = process.env.SIBYL_ALERT_WEBHOOK || process.env.WECOM_WEBHOOK ||
    config.alerts?.webhook || config.report?.webhook || '';
  const reportWebhook = process.env.SIBYL_REPORT_WEBHOOK || process.env.WECOM_WEBHOOK ||
    config.report?.webhook || '';
  const taskHasAlertWebhook = commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK', 'WECOM_WEBHOOK']);
  const taskHasReportWebhook = commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK']);

  checkLine(recommended, 'recommended', '当前进程即时预警 webhook', maskStatus(alertWebhook),
    maskStatus(alertWebhook) ? '当前进程/配置可读取' : '当前进程未检测到',
    '如果 webhook 是在 OpenClaw 定时任务 payload 中 export 注入，手动运行自检时可能读不到，可在下方人工确认或用 --task-command 传入任务命令。');

  checkLine(recommended, 'recommended', '当前进程综合播报 webhook', maskStatus(reportWebhook),
    maskStatus(reportWebhook) ? '当前进程/配置可读取' : '当前进程未检测到',
    '如果 webhook 是在 OpenClaw 定时任务 payload 中 export 注入，手动运行自检时可能读不到，可在下方人工确认或用 --task-command 传入任务命令。');

  checkLine(recommended, 'recommended', 'OpenClaw任务即时预警 webhook', taskHasAlertWebhook,
    taskHasAlertWebhook ? '任务命令中检测到 SIBYL_ALERT_WEBHOOK 或 WECOM_WEBHOOK' : '未传入任务命令，无法自动判断',
    '可运行：node scripts/check-deploy.js --task-command=\"export SIBYL_ALERT_WEBHOOK=... && node scripts/instant-alerts.js --push\"。');

  checkLine(recommended, 'recommended', 'OpenClaw任务综合播报 webhook', taskHasReportWebhook,
    taskHasReportWebhook ? '任务命令中检测到 SIBYL_REPORT_WEBHOOK 或 WECOM_WEBHOOK' : '未传入任务命令，无法自动判断',
    '可运行：node scripts/check-deploy.js --task-command=\"export SIBYL_REPORT_WEBHOOK=... && node scripts/sibyl.js --push\"。');

  checkLine(recommended, 'recommended', 'webhook 拆分', (
    (maskStatus(process.env.SIBYL_ALERT_WEBHOOK) && maskStatus(process.env.SIBYL_REPORT_WEBHOOK)) ||
    (commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK']) && commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK']))
  ),
    (maskStatus(process.env.SIBYL_ALERT_WEBHOOK) && maskStatus(process.env.SIBYL_REPORT_WEBHOOK)) ||
      (commandHasVariable(taskCommands, ['SIBYL_ALERT_WEBHOOK']) && commandHasVariable(taskCommands, ['SIBYL_REPORT_WEBHOOK']))
      ? '已检测到即时预警和综合播报分开配置'
      : '当前进程或传入任务命令中未同时检测到两个专用 webhook',
    '推荐分别配置 SIBYL_ALERT_WEBHOOK 和 SIBYL_REPORT_WEBHOOK，WECOM_WEBHOOK 只做兜底。');

  const weiboAppId = process.env.SIBYL_WEIBO_APP_ID || weiboAI.appId || openclawWeibo.appId || '';
  const weiboAppSecret = process.env.SIBYL_WEIBO_APP_SECRET || weiboAI.appSecret || openclawWeibo.appSecret || '';
  checkLine(optional, 'optional', '微博智搜 appId', maskStatus(weiboAppId),
    maskStatus(weiboAppId) ? '已配置' : '未配置',
    '配置 SIBYL_WEIBO_APP_ID，或在 alerts.weiboAI / openclaw.json channels.weibo 中配置。');
  checkLine(optional, 'optional', '微博智搜 appSecret', maskStatus(weiboAppSecret),
    maskStatus(weiboAppSecret) ? '已配置' : '未配置',
    '配置 SIBYL_WEIBO_APP_SECRET，或在 alerts.weiboAI / openclaw.json channels.weibo 中配置。');

  const authUrl = process.env.SIBYL_WEIBO_WIS_AUTH_URL || weiboAI.authUrl || DEFAULT_WEIBO_WIS_AUTH_URL;
  const searchUrl = process.env.SIBYL_WEIBO_WIS_SEARCH_URL || weiboAI.searchUrl || DEFAULT_WEIBO_WIS_SEARCH_URL;
  checkLine(optional, 'optional', '微博智搜 auth endpoint', maskStatus(authUrl),
    authUrl, '如微博接口变更，配置 SIBYL_WEIBO_WIS_AUTH_URL。');
  checkLine(optional, 'optional', '微博智搜 search endpoint', maskStatus(searchUrl),
    searchUrl, '如微博接口变更，配置 SIBYL_WEIBO_WIS_SEARCH_URL。');

  checkLine(optional, 'optional', 'AI 模型配置', maskStatus(modelConfig.apiKey),
    maskStatus(modelConfig.apiKey) ? '已配置' : '未配置',
    '配置 OpenClaw models.providers.aliyun 或 config.ai；缺失时会使用规则兜底。');

  const agentReachSummary = config.alerts?.agentReachSummary || {};
  const openclawCommand = agentReachSummary.command || 'openclaw';
  const retrieverAgent = agentReachSummary.agent || 'sibyl-retriever';
  checkLine(optional, 'optional', 'OpenClaw Agent CLI', commandExists(openclawCommand),
    commandExists(openclawCommand) ? `${openclawCommand} 可执行` : `${openclawCommand} 不在 PATH 中`,
    '联网摘要通过 openclaw agent --json 发起带工具的子Agent任务，请确认OpenClaw CLI已安装并可执行。');
  checkLine(optional, 'optional', 'Sibyl 专用取材 Agent',
    fs.existsSync(path.join('/root/.openclaw/agents', retrieverAgent)),
    fs.existsSync(path.join('/root/.openclaw/agents', retrieverAgent))
      ? `${retrieverAgent} 已存在`
      : `${retrieverAgent} 未创建`,
    '使用 openclaw agents add 创建专用取材Agent，并保持无渠道、无消息绑定。');

  const retrievalStateFile = healthFile(dataDir);
  const retrievalStateExists = fs.existsSync(retrievalStateFile);
  const retrievalState = loadHealthState({ dataDir });
  const retrievalIds = Array.isArray(config.retrieval?.capabilities)
    ? config.retrieval.capabilities
    : DEFAULT_RETRIEVAL_CAPABILITIES;
  const retrievalCapabilities = listCapabilities(retrievalState, retrievalIds);
  const healthyRetrieval = retrievalCapabilities.filter(item => item.status === 'healthy');
  const retrievalStatus = retrievalCapabilities
    .map(item => `${item.id}=${item.status}`)
    .join(', ');
  checkLine(optional, 'optional', '检索能力状态表',
    !retrievalStateExists || healthyRetrieval.length > 0,
    retrievalStateExists
      ? retrievalStatus
      : `尚未生成；首次回写后创建于 ${retrievalStateFile}`,
    '运行 node scripts/retrieval-health.js status 查看状态；到期能力用 probe-due 查询并进行真实轻量探测。');

  const timezone = readTimezone();
  const timezoneOk = [timezone.intl, timezone.timezoneFile, timezone.localtime]
    .filter(Boolean)
    .some(value => /Asia\/Shanghai|Shanghai/.test(value));
  checkLine(recommended, 'recommended', '系统时区', timezoneOk,
    `Intl=${timezone.intl || '未知'} / timezone=${timezone.timezoneFile || '未知'} / localtime=${timezone.localtime || '未知'}`,
    'Sibyl 的 10-22 调度窗口按北京时间理解，建议统一为 Asia/Shanghai。');

  checkLine(manual, 'manual', 'OpenClaw delivery.mode', false,
    '需要在 OpenClaw 任务配置中人工确认',
    'Sibyl热点综合播报 和 Sibyl快照采集与即时预警 都应为 none。');
  checkLine(manual, 'manual', '定时任务', false,
    '需要在 OpenClaw / crontab 中人工确认',
    '10:00-22:00 每10分钟运行 collect-snapshot + instant-alerts；每小时运行 sibyl.js --push。');
  checkLine(manual, 'manual', 'OpenClaw任务payload中的webhook', taskHasAlertWebhook && taskHasReportWebhook,
    taskCommands ? '已根据传入任务命令做辅助检查' : '未传入任务命令；若 webhook 写在 OpenClaw 任务 payload 中，请以 OpenClaw 配置为准',
    '自检脚本不能直接读取 OpenClaw UI 里的任务 payload；可用 --task-command 或 SIBYL_OPENCLAW_TASK_COMMANDS 辅助检查。');

  console.log('# Sibyl System 部署自检');
  console.log(`运行时间：${new Date().toISOString()}`);
  console.log(`数据目录：${dataDir}`);
  console.log(`配置文件：${configFile}`);

  printSection('必需项', required);
  printSection('推荐项', recommended);
  printSection('可选增强', optional);
  printSection('人工确认', manual);

  const missingRequired = required.filter(item => !item.ok).length;
  const warnings = recommended.filter(item => !item.ok).length + optional.filter(item => !item.ok).length;
  console.log(`\n结论：必需缺失 ${missingRequired} 项，提醒 ${warnings} 项。`);

  if (missingRequired > 0 && process.argv.includes('--strict')) process.exit(1);
}

main();
