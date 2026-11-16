// Push for briefings and instant alerts.
// Channels: WeCom (WeChat Work, the original), Slack and Discord incoming webhooks, and Telegram
// (a bot that messages one chat, for people who do not use a work chat app).
// Briefings go to every place that is set: SIBYL_SLACK_WEBHOOK, SIBYL_DISCORD_WEBHOOK,
// SIBYL_REPORT_WEBHOOK (any service, such as WeCom or a relay; config report.webhook) and the
// Telegram bot. Alerts go to SIBYL_ALERT_WEBHOOK (config alerts.webhook) when it is set, and
// otherwise to the same places, using Telegram's alert chat if one is set.
// The channel is read from the webhook host, or set explicitly with config "channel".
// Unknown hosts get the WeCom payload, as v1.3.20 sent to every webhook.
// Telegram can be set as a URL (https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>)
// or, more simply, with SIBYL_TELEGRAM_BOT_TOKEN and SIBYL_TELEGRAM_CHAT_ID (or config.telegram).

const http = require('http');
const https = require('https');

const CHANNELS = {
  wecom: { limit: 3200, unit: 'bytes' },
  slack: { limit: 3500, unit: 'chars' },
  discord: { limit: 1900, unit: 'chars' },
  // Telegram allows 4,096 characters per message after formatting is applied.
  telegram: { limit: 3800, unit: 'chars' }
};

const CHANNEL_LABELS = {
  wecom: 'WeCom',
  slack: 'Slack',
  discord: 'Discord',
  telegram: 'Telegram'
};

// A drawn line for the briefing's "---", which Slack, Telegram and Discord do not draw themselves.
const SEPARATOR = '────────';

function detectChannel(webhookUrl, explicitChannel = '') {
  if (explicitChannel && CHANNELS[explicitChannel]) return explicitChannel;
  let host = '';
  try {
    host = new URL(webhookUrl).hostname;
  } catch (e) {
    return 'wecom';
  }
  if (/(^|\.)hooks\.slack\.com$/i.test(host)) return 'slack';
  if (/(^|\.)(discord|discordapp)\.com$/i.test(host)) return 'discord';
  if (/(^|\.)api\.telegram\.org$/i.test(host)) return 'telegram';
  return 'wecom';
}

function measure(text, channel) {
  return CHANNELS[channel].unit === 'bytes' ? Buffer.byteLength(text, 'utf8') : text.length;
}

// Splits a message at briefing items ("### N. "), then at lines if one item is still too long.
function splitMessage(text, channel) {
  const limit = CHANNELS[channel].limit;
  if (measure(text, channel) <= limit) return [text];

  const pieces = [];
  text.split(/\n(?=### \d+\. )/).forEach(section => {
    if (measure(section, channel) <= limit) {
      pieces.push(section);
      return;
    }
    let current = '';
    section.split('\n').forEach(line => {
      const candidate = current ? `${current}\n${line}` : line;
      if (measure(candidate, channel) > limit && current) {
        pieces.push(current);
        current = line;
      } else {
        current = candidate;
      }
    });
    if (current) pieces.push(current);
  });

  const chunks = [];
  let current = pieces.shift() || '';
  for (const piece of pieces) {
    if (measure(`${current}\n${piece}`, channel) > limit && current.trim()) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += `\n${piece}`;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Slack uses its own markup: *bold*, <url|text>, no headings.
function toSlackMarkup(markdown) {
  return markdown
    .split('\n')
    .map(line => line
      .replace(/^#{1,6}\s+(.*)$/, '*$1*')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<$2|$1>')
      .replace(/^-{3,}$/, SEPARATOR))
    .join('\n');
}

// Discord reads headings, **bold** and links as written, but shows "---" as three dashes (tested
// 2026-11-16), so the separator becomes a drawn line.
function toDiscordMarkdown(markdown) {
  return markdown
    .split('\n')
    .map(line => line.replace(/^-{3,}$/, SEPARATOR))
    .join('\n');
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Telegram reads a small set of HTML tags: headings and **bold** become <b>, links become <a>.
function toTelegramHtml(markdown) {
  return markdown
    .split('\n')
    .map(line => escapeHtml(line)
      .replace(/^#{1,6}\s+(.*)$/, '<b>$1</b>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => `<a href="${url.replace(/"/g, '&quot;')}">${label}</a>`)
      .replace(/^-{3,}$/, SEPARATOR))
    .join('\n');
}

function payloadFor(channel, content, options = {}) {
  if (channel === 'slack') return { text: toSlackMarkup(content), mrkdwn: true };
  // flags 4 (SUPPRESS_EMBEDS): no link preview cards, which Discord adds under a webhook message
  // by default; allowed_mentions: a trend title such as "@everyone" notifies nobody.
  if (channel === 'discord') return { content: toDiscordMarkdown(content), flags: 4, allowed_mentions: { parse: [] } };
  if (channel === 'telegram') {
    return {
      chat_id: options.chatId,
      text: toTelegramHtml(content),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    };
  }
  return { msgtype: 'markdown', markdown: { content } };
}

function isSuccess(channel, statusCode, body) {
  if (channel === 'slack') return statusCode === 200 && String(body).trim() === 'ok';
  if (channel === 'discord') return statusCode === 204 || statusCode === 200;
  try {
    const parsed = JSON.parse(body);
    if (channel === 'telegram') return statusCode === 200 && parsed.ok === true;
    return parsed.errcode === 0;
  } catch (e) {
    return false;
  }
}

function telegramUrl(botToken, chatId) {
  return `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${encodeURIComponent(chatId)}`;
}

// Telegram settings: environment first, then config.telegram. kind is 'report' or 'alert'.
function telegramTarget(config = {}, kind = 'report') {
  const settings = config.telegram || {};
  const botToken = process.env.SIBYL_TELEGRAM_BOT_TOKEN || settings.botToken || '';
  const chatId = (kind === 'alert' && (process.env.SIBYL_TELEGRAM_ALERT_CHAT_ID || settings.alertChatId)) ||
    process.env.SIBYL_TELEGRAM_CHAT_ID ||
    settings.chatId ||
    '';
  return botToken && chatId ? telegramUrl(botToken, String(chatId)) : '';
}

function sendMessage(webhookUrl, content, options = {}) {
  return new Promise(resolve => {
    if (!webhookUrl) {
      resolve(false);
      return;
    }

    let url;
    try {
      url = new URL(webhookUrl);
    } catch (e) {
      resolve(false);
      return;
    }
    const channel = detectChannel(webhookUrl, options.channel);
    // Telegram takes the chat in the request body; its URL keeps it only as the place to store it.
    const isTelegram = channel === 'telegram';
    const data = JSON.stringify(payloadFor(channel, content, { chatId: url.searchParams.get('chat_id') }));
    const client = url.protocol === 'http:' ? http : https;

    const req = client.request({
      hostname: url.hostname,
      port: url.port || undefined,
      path: isTelegram ? url.pathname : url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(isSuccess(channel, res.statusCode, body)));
    });

    req.on('error', () => resolve(false));
    req.setTimeout(options.timeoutMs || 10000, () => {
      req.destroy();
      resolve(false);
    });
    req.write(data);
    req.end();
  });
}

// Every place the hourly briefing goes, each once: the Slack and Discord webhooks, the general
// webhook (SIBYL_REPORT_WEBHOOK, then the shared WECOM_WEBHOOK, then config report.webhook, with
// report.channel) and the Telegram bot. Environment variables win over config, as in v1.3.20.
// kind 'alert' uses Telegram's alert chat when one is set.
function reportTargets(config = {}, kind = 'report') {
  const report = config.report || {};
  const targets = [];
  const add = (webhook, channel = '') => {
    if (webhook && !targets.some(target => target.webhook === webhook)) targets.push({ webhook, channel });
  };
  add(process.env.SIBYL_SLACK_WEBHOOK || '');
  add(process.env.SIBYL_DISCORD_WEBHOOK || '');
  add(process.env.SIBYL_REPORT_WEBHOOK || process.env.WECOM_WEBHOOK || report.webhook || '', report.channel || '');
  add(telegramTarget(config, kind), 'telegram');
  return targets;
}

// Where instant alerts go: a separate place when SIBYL_ALERT_WEBHOOK (or config alerts.webhook,
// with alerts.channel) is set, otherwise wherever briefings go.
function alertTargets(config = {}) {
  const alerts = config.alerts || {};
  const separate = process.env.SIBYL_ALERT_WEBHOOK || alerts.webhook || '';
  if (separate) return [{ webhook: separate, channel: alerts.channel || '' }];
  return reportTargets(config, 'alert');
}

// The first place of each list, for callers that need only one.
function reportTarget(config = {}) {
  return reportTargets(config)[0] || { webhook: '', channel: '' };
}

function alertTarget(config = {}) {
  return alertTargets(config)[0] || { webhook: '', channel: '' };
}

// "Slack", "Discord", "WeCom" or "Telegram", for messages to the person.
function channelLabel(target) {
  return CHANNEL_LABELS[detectChannel(target.webhook, target.channel)];
}

// Sends a briefing to every place; returns [{ label, sent }] in the same order.
async function sendToTargets(targets, text, options = {}) {
  const results = [];
  for (const target of targets) {
    const sent = await sendInParts(target.webhook, text, { ...options, channel: target.channel });
    results.push({ label: channelLabel(target), sent });
  }
  return results;
}

// Sends a long message in parts, prefixing "<title> (i/n)" when it needs more than one.
async function sendInParts(webhookUrl, text, options = {}) {
  const channel = detectChannel(webhookUrl, options.channel);
  const chunks = splitMessage(text, channel);
  let allSent = true;
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 && options.title ? `${options.title} (${i + 1}/${chunks.length})\n\n` : '';
    const sent = await sendMessage(webhookUrl, prefix + chunks[i], { ...options, channel });
    allSent = allSent && sent;
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 500));
    }
  }
  return allSent;
}

module.exports = {
  CHANNELS,
  CHANNEL_LABELS,
  alertTarget,
  alertTargets,
  channelLabel,
  detectChannel,
  payloadFor,
  reportTarget,
  reportTargets,
  sendInParts,
  sendMessage,
  sendToTargets,
  splitMessage,
  telegramTarget,
  telegramUrl,
  toDiscordMarkdown,
  toSlackMarkup,
  toTelegramHtml
};
