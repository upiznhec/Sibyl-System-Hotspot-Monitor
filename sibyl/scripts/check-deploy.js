#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { readModelSettings } = require('./lib/model-config');
const {
  CHANNELS,
  alertTarget,
  detectChannel,
  reportTarget
} = require('./lib/webhook');

const CHANNEL_LABELS = {
  wecom: '企业微信',
  slack: 'Slack',
  discord: 'Discord'
};

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
  const taskHint = '如果 webhook 只写在定时任务命令里，手动运行自检时读不到，可在下方人工确认或用 --task-command 传入任务命令。';

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

  const timezone = readTimezone();
  const timezoneOk = [timezone.intl, timezone.timezoneFile, timezone.localtime]
    .filter(Boolean)
    .some(value => /Asia\/Shanghai|Shanghai/.test(value));
  checkLine(recommended, 'recommended', '系统时区', timezoneOk,
    `Intl=${timezone.intl || '未知'} / timezone=${timezone.timezoneFile || '未知'} / localtime=${timezone.localtime || '未知'}`,
    'Sibyl 的 10-22 调度窗口按北京时间理解，建议统一为 Asia/Shanghai。');

  checkLine(manual, 'manual', '避免重复推送', false,
    '需要在调度工具中人工确认',
    '脚本带 --push 时自己调用 webhook；调度工具只负责按时运行，不要再把运行结果另发一次。');
  checkLine(manual, 'manual', '定时任务', false,
    '需要在 crontab 或其他调度工具中人工确认',
    '10:00-22:00 每10分钟运行 collect-snapshot + instant-alerts；每小时运行 sibyl.js --push。');
  checkLine(manual, 'manual', '定时任务中的 webhook', taskHasAlertWebhook && taskHasReportWebhook,
    taskCommands ? '已根据传入任务命令做辅助检查' : '未传入任务命令；若 webhook 只写在定时任务里，请以任务配置为准',
    '自检脚本读不到调度工具里的任务配置；可用 --task-command 或 SIBYL_TASK_COMMANDS 辅助检查。');

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
