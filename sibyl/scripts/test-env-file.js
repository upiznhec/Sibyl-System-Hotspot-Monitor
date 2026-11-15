#!/usr/bin/env node

// data/.env: the person's keys and webhook addresses, kept out of config.json and the schedule.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { envFileIsPrivate, loadEnvFile, parseEnvText } = require('./lib/env-file');

assert.deepStrictEqual(parseEnvText([
  '# a comment',
  '',
  'SIBYL_X_BEARER_TOKEN=abc',
  "export SIBYL_YOUTUBE_API_KEY='key with space'",
  'SIBYL_REPORT_WEBHOOK="https://example.com/hook?a=1"',
  'not a setting',
  'BAD-NAME=1'
].join('\n')), {
  SIBYL_X_BEARER_TOKEN: 'abc',
  SIBYL_YOUTUBE_API_KEY: 'key with space',
  SIBYL_REPORT_WEBHOOK: 'https://example.com/hook?a=1'
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-env-'));
try {
  assert.deepStrictEqual(loadEnvFile(dir), { file: path.join(dir, '.env'), exists: false, loaded: [] });
  fs.writeFileSync(path.join(dir, '.env'), 'SIBYL_TEST_ONE=1\nSIBYL_TEST_TWO=from-file\n', { mode: 0o600 });
  process.env.SIBYL_TEST_TWO = 'already set';
  const result = loadEnvFile(dir);
  assert.deepStrictEqual(result.loaded, ['SIBYL_TEST_ONE']);
  assert.strictEqual(process.env.SIBYL_TEST_ONE, '1');
  assert.strictEqual(process.env.SIBYL_TEST_TWO, 'already set', 'a variable already set wins');
  if (process.platform !== 'win32') {
    assert.strictEqual(envFileIsPrivate(dir), true);
    fs.chmodSync(path.join(dir, '.env'), 0o644);
    assert.strictEqual(envFileIsPrivate(dir), false);
  }
} finally {
  delete process.env.SIBYL_TEST_ONE;
  delete process.env.SIBYL_TEST_TWO;
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('env file tests passed');
