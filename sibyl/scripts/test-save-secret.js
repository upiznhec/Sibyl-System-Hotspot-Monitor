#!/usr/bin/env node

// save-secret.js: the person pastes a key at a prompt that shows nothing; it lands in data/.env and
// nowhere else, replaces an older value and keeps the other lines.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { parseEnvText, setEnvValue } = require('./lib/env-file');
const { resolveSecret } = require('./save-secret');

assert.strictEqual(setEnvValue('', 'SIBYL_A', 'one'), 'SIBYL_A=one\n');
assert.strictEqual(setEnvValue('SIBYL_B=keep\nexport SIBYL_A=old\n# note\n\n', 'SIBYL_A', 'new'), 'SIBYL_B=keep\n# note\nSIBYL_A=new\n');
assert.throws(() => setEnvValue('', 'BAD-NAME', 'x'));
assert.throws(() => setEnvValue('', 'SIBYL_A', 'two\nlines'));

assert.strictEqual(resolveSecret('youtube').name, 'SIBYL_YOUTUBE_API_KEY');
assert.strictEqual(resolveSecret('X').name, 'SIBYL_X_BEARER_TOKEN');
assert.strictEqual(resolveSecret('ai').name, 'SIBYL_AI_API_KEY');
assert.strictEqual(resolveSecret('telegram').name, 'SIBYL_TELEGRAM_BOT_TOKEN');
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
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('save secret tests passed');
