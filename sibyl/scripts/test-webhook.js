#!/usr/bin/env node

// Webhook push: channel detection, payloads, message splitting, success rules per service,
// and where alerts and briefings are sent. Uses a local HTTP server; nothing leaves the machine.

const assert = require('assert');
const http = require('http');

const {
  CHANNELS,
  alertTarget,
  detectChannel,
  payloadFor,
  reportTarget,
  sendInParts,
  sendMessage,
  splitMessage
} = require('./lib/webhook');

['SIBYL_ALERT_WEBHOOK', 'SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK'].forEach(key => delete process.env[key]);

function measure(text, channel) {
  return CHANNELS[channel].unit === 'bytes' ? Buffer.byteLength(text, 'utf8') : text.length;
}

function briefing(itemCount, itemChars) {
  const header = '# 热点综合播报\n生成时间：10:00';
  const items = Array.from({ length: itemCount }, (_, i) =>
    `### ${i + 1}. 话题${i + 1}\n${'内'.repeat(itemChars)}\n**来源**：[查看](https://example.test/${i + 1})`);
  return [header, ...items].join('\n');
}

function startServer(reply) {
  return new Promise(resolve => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        received.push({ path: req.url, body: JSON.parse(body) });
        reply(res, received.length);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, received, url: `http://127.0.0.1:${server.address().port}/hook?key=test` });
    });
  });
}

function checkChannels() {
  assert.strictEqual(detectChannel('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x'), 'wecom');
  assert.strictEqual(detectChannel('https://hooks.slack.com/services/T0/B0/X'), 'slack');
  assert.strictEqual(detectChannel('https://discord.com/api/webhooks/1/abc'), 'discord');
  assert.strictEqual(detectChannel('https://discordapp.com/api/webhooks/1/abc'), 'discord');
  // Unknown hosts get the WeCom format, as v1.3.20 sent it to every webhook.
  assert.strictEqual(detectChannel('https://relay.example.test/hook'), 'wecom');
  assert.strictEqual(detectChannel('https://hooks.slack.com.example.test/x'), 'wecom');
  assert.strictEqual(detectChannel('not a url'), 'wecom');
  // An explicit channel wins; an unknown one is ignored.
  assert.strictEqual(detectChannel('https://relay.example.test/hook', 'slack'), 'slack');
  assert.strictEqual(detectChannel('https://hooks.slack.com/services/x', 'feishu'), 'slack');
}

function checkPayloads() {
  assert.deepStrictEqual(payloadFor('wecom', 'x'), { msgtype: 'markdown', markdown: { content: 'x' } });
  assert.deepStrictEqual(payloadFor('discord', 'x'), { content: 'x' });
  assert.deepStrictEqual(payloadFor('slack', '### 1. 标题\n**来源**：[查看](https://example.test/a)\n---'), {
    text: '*1. 标题*\n*来源*：<https://example.test/a|查看>\n────────',
    mrkdwn: true
  });
}

function checkSplitting() {
  assert.deepStrictEqual(splitMessage('短消息', 'wecom'), ['短消息']);

  Object.keys(CHANNELS).forEach(channel => {
    const text = briefing(30, 400);
    const parts = splitMessage(text, channel);
    assert.ok(parts.length > 1, `${channel}: long briefing is split`);
    parts.forEach(part => assert.ok(measure(part, channel) <= CHANNELS[channel].limit, `${channel}: part within limit`));
    parts.slice(1).forEach(part => assert.ok(/^### \d+\. /.test(part), `${channel}: later parts start at an item`));
    assert.strictEqual(parts.join('\n'), text, `${channel}: nothing lost`);
  });

  // One item longer than the limit is split at line breaks instead of being sent too long.
  const longItem = `### 1. 长话题\n${Array.from({ length: 60 }, (_, i) => `第${i + 1}行${'字'.repeat(50)}`).join('\n')}`;
  const parts = splitMessage(longItem, 'discord');
  assert.ok(parts.length > 1);
  parts.forEach(part => assert.ok(part.length <= CHANNELS.discord.limit));
  assert.strictEqual(parts.join('\n'), longItem);
}

function checkTargets() {
  const config = {
    alerts: {},
    report: { webhook: 'https://relay.example.test/report', channel: 'slack' }
  };
  // Alerts fall back to the briefing webhook and then also use its channel.
  assert.deepStrictEqual(alertTarget(config), { webhook: 'https://relay.example.test/report', channel: 'slack' });
  // A separate alert webhook does not take the briefing's channel.
  config.alerts.webhook = 'https://discord.com/api/webhooks/1/abc';
  assert.deepStrictEqual(alertTarget(config), { webhook: 'https://discord.com/api/webhooks/1/abc', channel: '' });
  config.alerts.channel = 'discord';
  assert.strictEqual(alertTarget(config).channel, 'discord');
  assert.deepStrictEqual(reportTarget(config), { webhook: 'https://relay.example.test/report', channel: 'slack' });

  // Environment variables win over config, as in v1.3.20.
  process.env.WECOM_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=shared';
  assert.strictEqual(alertTarget(config).webhook, process.env.WECOM_WEBHOOK);
  assert.strictEqual(reportTarget(config).webhook, process.env.WECOM_WEBHOOK);
  process.env.SIBYL_ALERT_WEBHOOK = 'https://hooks.slack.com/services/alert';
  process.env.SIBYL_REPORT_WEBHOOK = 'https://hooks.slack.com/services/report';
  assert.strictEqual(alertTarget(config).webhook, 'https://hooks.slack.com/services/alert');
  assert.strictEqual(reportTarget(config).webhook, 'https://hooks.slack.com/services/report');
  ['SIBYL_ALERT_WEBHOOK', 'SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK'].forEach(key => delete process.env[key]);

  assert.deepStrictEqual(alertTarget({}), { webhook: '', channel: '' });
}

async function checkSending() {
  // Success rule per service: WeCom errcode 0, Slack 200 "ok", Discord 204.
  const cases = [
    { channel: 'wecom', status: 200, body: '{"errcode":0,"errmsg":"ok"}', expected: true },
    { channel: 'wecom', status: 200, body: '{"errcode":93000,"errmsg":"invalid webhook url"}', expected: false },
    { channel: 'slack', status: 200, body: 'ok', expected: true },
    { channel: 'slack', status: 400, body: 'invalid_payload', expected: false },
    { channel: 'discord', status: 204, body: '', expected: true },
    { channel: 'discord', status: 400, body: '{"message":"Cannot send an empty message"}', expected: false }
  ];
  for (const item of cases) {
    const { server, received, url } = await startServer(res => {
      res.statusCode = item.status;
      res.end(item.body);
    });
    const sent = await sendMessage(url, '**测试**', { channel: item.channel });
    server.close();
    assert.strictEqual(sent, item.expected, `${item.channel} ${item.status} ${item.body}`);
    assert.strictEqual(received[0].path, '/hook?key=test');
    assert.deepStrictEqual(received[0].body, payloadFor(item.channel, '**测试**'));
  }

  assert.strictEqual(await sendMessage('', 'x'), false);
  assert.strictEqual(await sendMessage('not a url', 'x'), false);

  // Long briefing to Discord: every part fits Discord's 2000-character limit with its "(i/n)" prefix.
  const text = briefing(20, 300);
  const discord = await startServer(res => {
    res.statusCode = 204;
    res.end();
  });
  assert.strictEqual(await sendInParts(discord.url, text, { channel: 'discord', title: '热点综合播报', delayMs: 0 }), true);
  discord.server.close();
  const contents = discord.received.map(item => item.body.content);
  assert.ok(contents.length > 1);
  contents.forEach((content, i) => {
    assert.ok(content.startsWith(`热点综合播报 (${i + 1}/${contents.length})\n\n`));
    assert.ok(content.length <= 2000);
  });
  assert.strictEqual(contents.map(content => content.replace(/^热点综合播报 \(\d+\/\d+\)\n\n/, '')).join('\n'), text);

  // One failed part makes the whole push count as failed.
  const flaky = await startServer((res, count) => {
    res.statusCode = 200;
    res.end(count === 2 ? '{"errcode":45009}' : '{"errcode":0}');
  });
  assert.strictEqual(await sendInParts(flaky.url, briefing(30, 400), { title: '热点综合播报', delayMs: 0 }), false);
  flaky.server.close();
}

async function main() {
  checkChannels();
  checkPayloads();
  checkSplitting();
  checkTargets();
  await checkSending();
  console.log('webhook tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
