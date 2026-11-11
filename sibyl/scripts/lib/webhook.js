// Push for briefings and instant alerts.
// Channels: WeCom (企业微信, the original), Slack and Discord incoming webhooks, and Telegram
// (a bot that messages one chat, for people who do not use a work chat app).
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
      .replace(/^-{3,}$/, '────────'))
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
      .replace(/^-{3,}$/, '────────'))
    .join('\n');
}

function payloadFor(channel, content, options = {}) {
  if (channel === 'slack') return { text: toSlackMarkup(content), mrkdwn: true };
  if (channel === 'discord') return { content };
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

// Where the hourly briefing goes. Environment variables win over config, as in v1.3.20.
function reportTarget(config = {}) {
  const report = config.report || {};
  const webhook = process.env.SIBYL_REPORT_WEBHOOK || process.env.WECOM_WEBHOOK || report.webhook || '';
  if (webhook) return { webhook, channel: report.channel || '' };
  // No webhook: a Telegram bot, if one is set.
  const telegram = telegramTarget(config, 'report');
  return { webhook: telegram, channel: telegram ? 'telegram' : '' };
}

// Where instant alerts go. Falls back to the briefing webhook, as in v1.3.20.
// An explicit "channel" belongs to the webhook it is written next to.
function alertTarget(config = {}) {
  const alerts = config.alerts || {};
  const report = config.report || {};
  const webhook = process.env.SIBYL_ALERT_WEBHOOK ||
    process.env.WECOM_WEBHOOK ||
    alerts.webhook ||
    report.webhook ||
    '';
  if (!webhook) {
    const telegram = telegramTarget(config, 'alert');
    return { webhook: telegram, channel: telegram ? 'telegram' : '' };
  }
  const usesReportWebhook = !alerts.webhook && webhook === report.webhook;
  return {
    webhook,
    channel: alerts.channel || (usesReportWebhook ? report.channel || '' : '')
  };
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
  alertTarget,
  detectChannel,
  payloadFor,
  reportTarget,
  sendInParts,
  sendMessage,
  splitMessage,
  telegramTarget,
  telegramUrl,
  toSlackMarkup,
  toTelegramHtml
};
