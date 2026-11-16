#!/usr/bin/env node

// save-secret.js: the person pastes a key at a prompt that shows only how many characters arrived;
// it lands in data/.env and nowhere else, replaces an older value (but not a good one with one that
// does not look right) and keeps the other lines. --remove deletes one.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');

const { parseEnvText, setEnvValue, unsetEnvValue } = require('./lib/env-file');
const { readHidden } = require('./lib/prompt');
const { resolveSecret } = require('./save-secret');

assert.strictEqual(setEnvValue('', 'SIBYL_A', 'one'), 'SIBYL_A=one\n');
assert.strictEqual(setEnvValue('SIBYL_B=keep\nexport SIBYL_A=old\n# note\n\n', 'SIBYL_A', 'new'), 'SIBYL_B=keep\n# note\nSIBYL_A=new\n');
assert.throws(() => setEnvValue('', 'BAD-NAME', 'x'));
assert.throws(() => setEnvValue('', 'SIBYL_A', 'two\nlines'));
assert.strictEqual(unsetEnvValue('SIBYL_B=keep\nexport SIBYL_A=old\nSIBYL_A=again\n', 'SIBYL_A'), 'SIBYL_B=keep\n');
assert.strictEqual(unsetEnvValue('SIBYL_A=only\n', 'SIBYL_A'), '');

assert.strictEqual(resolveSecret('youtube').name, 'SIBYL_YOUTUBE_API_KEY');
assert.strictEqual(resolveSecret('X').name, 'SIBYL_X_BEARER_TOKEN');
assert.strictEqual(resolveSecret('ai').name, 'SIBYL_AI_API_KEY');
assert.strictEqual(resolveSecret('telegram').name, 'SIBYL_TELEGRAM_BOT_TOKEN');
assert.strictEqual(resolveSecret('slack').name, 'SIBYL_SLACK_WEBHOOK');
assert.strictEqual(resolveSecret('Discord').name, 'SIBYL_DISCORD_WEBHOOK');
assert.strictEqual(resolveSecret('webhook').name, 'SIBYL_REPORT_WEBHOOK');
assert.strictEqual(resolveSecret('alert-webhook').name, 'SIBYL_ALERT_WEBHOOK');
assert.strictEqual(resolveSecret('SIBYL_IG_ACCESS_TOKEN').name, 'SIBYL_IG_ACCESS_TOKEN');
assert.strictEqual(resolveSecret('PATH'), null);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-secret-'));
const envFile = path.join(dir, '.env');
const script = path.join(__dirname, 'save-secret.js');
const run = (args, input) => spawnSync(process.execPath, [script, ...args], {
  input,
  encoding: 'utf8',
  env: { ...process.env, SIBYL_DATA_DIR: dir }
});
const saved = () => parseEnvText(fs.readFileSync(envFile, 'utf8'));

try {
  // Without a terminal it refuses, so an agent cannot run it in the person's place.
  const refused = run(['youtube'], 'AIzaFakeKeyForTests000000000000000000000\n');
  assert.strictEqual(refused.status, 2);
  assert.ok(!fs.existsSync(envFile));
  assert.strictEqual(run(['nonsense'], '').status, 2);

  fs.writeFileSync(envFile, 'SIBYL_REPORT_WEBHOOK=https://example.com/hook\n', { mode: 0o600 });
  const token = 'AAAAAAAAAAAAAAAAAAAAAFakeTokenForTests%2Bwith%3Dsigns/and+plus\\and#hash';
  const first = run(['x', '--from-stdin'], `${token}\n`);
  assert.strictEqual(first.status, 0, first.stdout + first.stderr);
  assert.ok(!first.stdout.includes(token) && !first.stderr.includes(token), 'the value is never printed');
  assert.strictEqual(saved().SIBYL_X_BEARER_TOKEN, token, 'stored byte for byte');
  assert.strictEqual(saved().SIBYL_REPORT_WEBHOOK, 'https://example.com/hook', 'other lines are kept');
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(envFile).mode & 0o777, 0o600);

  // Running it again replaces the value; an empty paste saves nothing.
  assert.strictEqual(run(['x', '--from-stdin'], 'AAAAFakeSecondTokenForTests0000000000\n').status, 0);
  assert.strictEqual(saved().SIBYL_X_BEARER_TOKEN, 'AAAAFakeSecondTokenForTests0000000000');
  assert.strictEqual(run(['x', '--from-stdin'], '\n').status, 1);
  const lines = fs.readFileSync(envFile, 'utf8').trim().split('\n');
  assert.strictEqual(lines.filter(line => line.startsWith('SIBYL_X_BEARER_TOKEN=')).length, 1);

  // A value that does not look right is saved, with a line saying what to check.
  const odd = run(['youtube', '--from-stdin'], 'not-a-google-key\n');
  assert.strictEqual(odd.status, 0);
  assert.ok(/does not look like a YouTube key/.test(odd.stdout));

  // But it does not replace one that does: in testing, a second, accidental run waited at the
  // prompt while the clipboard might hold anything.
  const slack = 'https://hooks.slack.com/services/T0/B0/fake';
  assert.strictEqual(run(['slack', '--from-stdin'], `${slack}\n`).status, 0);
  const wrong = run(['slack', '--from-stdin'], 'https://api.slack.com/apps/A0FAKE/incoming-webhooks\n');
  assert.strictEqual(wrong.status, 1);
  assert.ok(/does not look like a Slack webhook address/.test(wrong.stdout) && /Nothing was changed/.test(wrong.stdout));
  assert.strictEqual(saved().SIBYL_SLACK_WEBHOOK, slack, 'the working address is kept');
  assert.strictEqual(run(['slack', '--from-stdin'], 'https://hooks.slack.com/services/T0/B0/new\n').status, 0);
  assert.strictEqual(saved().SIBYL_SLACK_WEBHOOK, 'https://hooks.slack.com/services/T0/B0/new', 'a right one replaces it');

  // --remove asks for nothing, so it runs without a terminal; the other lines stay.
  const removed = run(['slack', '--remove'], '');
  assert.strictEqual(removed.status, 0);
  assert.ok(/Removed SIBYL_SLACK_WEBHOOK/.test(removed.stdout));
  assert.ok(!('SIBYL_SLACK_WEBHOOK' in saved()));
  assert.strictEqual(saved().SIBYL_REPORT_WEBHOOK, 'https://example.com/hook');
  assert.ok(/was not saved/.test(run(['discord', '--remove'], '').stdout));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

// The hidden prompt shows how many characters arrived, never the value. In testing, a person said
// "saved" while the prompt was still waiting, because a paste showed nothing at all.
function fakeTerminal() {
  const input = new EventEmitter();
  input.setRawMode = () => {};
  input.setEncoding = () => {};
  input.resume = () => {};
  input.pause = () => {};
  const written = [];
  return { input, output: { write: text => written.push(text) }, written };
}

async function checkHiddenPrompt() {
  const terminal = fakeTerminal();
  const reading = readHidden(terminal.input, terminal.output);
  terminal.input.emit('data', '\u001b[200~secret-value-123\u001b[201~');
  terminal.input.emit('data', '\u007f');
  terminal.input.emit('data', '\r');
  assert.strictEqual(await reading, 'secret-value-12');
  const screen = terminal.written.join('');
  assert.ok(!screen.includes('secret'), 'the value is never written');
  assert.deepStrictEqual(terminal.written.slice(0, 3), [
    '\r  Nothing pasted yet.',
    '\r  Received 16 characters. Press Return to finish.',
    '\r  Received 15 characters. Press Return to finish.'
  ]);
  assert.ok(screen.endsWith('\n'));

  const cancelled = fakeTerminal();
  const pending = readHidden(cancelled.input, cancelled.output);
  cancelled.input.emit('data', 'abc\u0003');
  await assert.rejects(pending, /cancelled/);
}

checkHiddenPrompt().then(() => console.log('save secret tests passed')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
