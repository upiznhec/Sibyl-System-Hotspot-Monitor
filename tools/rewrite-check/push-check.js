#!/usr/bin/env node
// Checks the push path, which run.js and run-alerts.js leave off. Runs instant-alerts.js and
// sibyl.js with push on against a local HTTP server, using the first saved snapshot, and
// compares what arrives with the v1.3.20 output of the same input. Nothing leaves the machine.
//
// Usage: node tools/rewrite-check/push-check.js --original-out <dir> --original-alerts <dir> [--work <dir>]
//   <dir>s are the outputs of run.js and run-alerts.js on the v1.3.20 code (see README.md).
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const tool = __dirname;
const repo = path.resolve(tool, '..', '..');
const originalOut = argValue('--original-out');
const originalAlerts = argValue('--original-alerts');
if (!originalOut || !originalAlerts) {
  console.error('Usage: node tools/rewrite-check/push-check.js --original-out <dir> --original-alerts <dir> [--work <dir>]');
  process.exit(2);
}
const scratch = path.resolve(argValue('--work', path.join(tool, 'out-push')));
const fixtures = path.join(tool, 'fixtures');
const { toSlackMarkup } = require(path.join(repo, 'sibyl/scripts/lib/webhook'));
const { checkConfig } = require('./check-config');

const cleanEnv = { ...process.env };
['SIBYL_ALERT_WEBHOOK', 'SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK', 'SIBYL_AI_API_KEY', 'SIBYL_AI_MODEL', 'SIBYL_AI_BASE_URL']
  .forEach(key => delete cleanEnv[key]);

const snap = fs.readdirSync(path.join(fixtures, 'snapshots')).filter(f => f.endsWith('.json'))
  .map(f => path.join(fixtures, 'snapshots', f))
  .map(file => ({ file, snapshot: JSON.parse(fs.readFileSync(file, 'utf8')) }))
  .sort((a, b) => Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt))[0];
const fakeNow = new Date(Date.parse(snap.snapshot.capturedAt) + 5 * 60000).toISOString();
const baseConfig = checkConfig(fixtures);

function startServer(reply) {
  return new Promise(resolve => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        received.push(JSON.parse(body));
        reply(res, received.length);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({
      server, received, url: `http://127.0.0.1:${server.address().port}/cgi-bin/webhook/send?key=local`
    }));
  });
}

function dataDir(name, config) {
  const dir = path.join(scratch, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
  fs.copyFileSync(snap.file, path.join(dir, 'snapshot-latest.json'));
  return dir;
}

function run(script, args, dir, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-r', path.join(tool, 'fake-clock.js'), path.join(repo, 'sibyl/scripts', script), ...args], {
      cwd: path.join(repo, 'sibyl'),
      env: { ...cleanEnv, SIBYL_DATA_DIR: dir, FAKE_NOW: fakeNow, SIBYL_CONFIG: '', ...env }
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    child.on('close', code => resolve({ code, out }));
  });
}

const alertMessages = text => text.split('\n\n').map(block => block.trim()).filter(block => block.startsWith('🔥'));
const stripPrefix = content => content.replace(/^热点综合播报 \(\d+\/\d+\)\n\n/, '');

async function main() {
  const baselineMessages = alertMessages(fs.readFileSync(path.join(path.resolve(originalAlerts), 'step-1', 'data', 'stdout.txt'), 'utf8'));
  assert.ok(baselineMessages.length > 0);

  // A. Alerts to WeCom via WECOM_WEBHOOK and --push: same messages as v1.3.20, in the WeCom payload.
  let srv = await startServer(res => res.end('{"errcode":0,"errmsg":"ok"}'));
  let dir = dataDir('a-wecom', baseConfig);
  let result = await run('instant-alerts.js', ['--no-summary', '--push'], dir, { WECOM_WEBHOOK: srv.url });
  assert.strictEqual(result.code, 0, result.out);
  assert.deepStrictEqual(srv.received, baselineMessages.map(content => ({ msgtype: 'markdown', markdown: { content } })));
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'alerts-state.json'), 'utf8'));
  assert.strictEqual(Object.keys(state.reported).length, baselineMessages.length);
  result = await run('instant-alerts.js', ['--no-summary', '--push'], dir, { WECOM_WEBHOOK: srv.url });
  assert.ok(result.out.includes('候选 0 个'), 'second run is deduplicated');
  assert.strictEqual(srv.received.length, baselineMessages.length);
  srv.server.close();
  console.log(`A ok: ${baselineMessages.length} alerts sent to WeCom format, identical to v1.3.20 messages; rerun sends none`);

  // B. Failed sends undo the dedupe record, as in v1.3.20.
  srv = await startServer(res => res.end('{"errcode":93000,"errmsg":"invalid webhook url"}'));
  dir = dataDir('b-fail', baseConfig);
  result = await run('instant-alerts.js', ['--no-summary', '--push'], dir, { SIBYL_ALERT_WEBHOOK: srv.url });
  srv.server.close();
  assert.strictEqual(result.code, 0, result.out);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'alerts-state.json'), 'utf8')).reported, {});
  assert.strictEqual(result.out.split('即时预警发送失败').length - 1, baselineMessages.length);
  console.log('B ok: failed sends leave no dedupe record');

  // C. Alerts to Slack, switched on by config "push" (no --push flag), channel set in config.
  srv = await startServer(res => res.end('ok'));
  dir = dataDir('c-slack', { ...baseConfig, alerts: { ...baseConfig.alerts, pushWeCom: false, push: true, webhook: srv.url, channel: 'slack' } });
  result = await run('instant-alerts.js', ['--no-summary'], dir);
  srv.server.close();
  assert.strictEqual(result.code, 0, result.out);
  assert.deepStrictEqual(srv.received, baselineMessages.map(message => ({ text: toSlackMarkup(message), mrkdwn: true })));
  console.log('C ok: Slack payloads, config "push" switch works');

  // D. Briefing to WeCom via SIBYL_REPORT_WEBHOOK and --push: content equals the v1.3.20 report file.
  srv = await startServer(res => res.end('{"errcode":0}'));
  dir = dataDir('d-report', baseConfig);
  result = await run('sibyl.js', ['--no-ai', '--no-summary', '--push'], dir, { SIBYL_REPORT_WEBHOOK: srv.url });
  srv.server.close();
  assert.strictEqual(result.code, 0, result.out);
  assert.ok(result.out.includes('推送: 已发送'), result.out);
  const baselineReport = fs.readFileSync(path.join(path.resolve(originalOut), 'step-1', 'data', 'report-latest.md'), 'utf8');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'report-latest.md'), 'utf8'), baselineReport);
  assert.strictEqual(srv.received.map(item => stripPrefix(item.markdown.content)).join('\n').trim(), baselineReport.trim());
  if (srv.received.length === 1) assert.strictEqual(srv.received[0].markdown.content, baselineReport);
  console.log(`D ok: briefing sent in ${srv.received.length} WeCom message(s), same text as the v1.3.20 report`);

  // E. Old switch name report.pushWeCom still turns push on; Discord channel set in config.
  srv = await startServer(res => { res.statusCode = 204; res.end(); });
  dir = dataDir('e-discord', { ...baseConfig, report: { ...baseConfig.report, pushWeCom: true, webhook: srv.url, channel: 'discord' } });
  result = await run('sibyl.js', ['--no-ai', '--no-summary'], dir);
  srv.server.close();
  assert.strictEqual(result.code, 0, result.out);
  assert.ok(srv.received.length >= 1);
  srv.received.forEach(item => assert.ok(typeof item.content === 'string' && item.content.length <= 2000));
  // Each message is trimmed, as v1.3.20 trims WeCom parts, so blank lines at split points go.
  const flat = text => text.replace(/\s+/g, ' ').trim();
  assert.strictEqual(flat(srv.received.map(item => stripPrefix(item.content)).join('\n')), flat(baselineReport));
  console.log(`E ok: old "pushWeCom" switch works; briefing sent to Discord in ${srv.received.length} message(s)`);

  // F. No push target: alerts and the briefing are saved as files (local date of the snapshot),
  // the once-a-day rule still holds, and a rerun saves nothing new.
  dir = dataDir('f-files', baseConfig);
  result = await run('instant-alerts.js', ['--no-summary'], dir);
  assert.strictEqual(result.code, 0, result.out);
  const alertFile = path.join(dir, 'alerts', '2026-11-11.md');
  assert.strictEqual(fs.readFileSync(alertFile, 'utf8'), `${baselineMessages.join('\n\n')}\n`);
  const savedState = JSON.parse(fs.readFileSync(path.join(dir, 'alerts-state.json'), 'utf8'));
  assert.strictEqual(Object.keys(savedState.reported).length, baselineMessages.length);
  result = await run('instant-alerts.js', ['--no-summary'], dir);
  assert.ok(result.out.includes('候选 0 个'), 'second run is deduplicated');
  assert.strictEqual(fs.readFileSync(alertFile, 'utf8'), `${baselineMessages.join('\n\n')}\n`);
  result = await run('sibyl.js', ['--no-ai', '--no-summary'], dir);
  assert.strictEqual(result.code, 0, result.out);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'briefings', '2026-11-11_1030.md'), 'utf8'), baselineReport);
  console.log('F ok: without a push target, alerts and the briefing are saved as files, once each');
  console.log('All 6 push checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
