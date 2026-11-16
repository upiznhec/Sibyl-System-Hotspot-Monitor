#!/usr/bin/env node

// The example config (the TikTok preset) and the English defaults fit together: every source
// exists, the main sources are switched on, topics compile, and the self-check runs on it.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en' });
const { defaultPlatformsConfig, defaultSeedPlatforms, getSource } = require('./lib/source-registry');
const { defaultPresetName, defaultTopicSettings, loadTopicSettings } = require('./lib/topic-settings');

const example = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));

assert.strictEqual(example.language, 'en');
assert.deepStrictEqual(Object.keys(example.platforms).filter(id => !getSource(id)), []);
assert.deepStrictEqual(example.report.seedPlatforms, ['google-trends', 'tiktok-creative-center']);
example.report.seedPlatforms.forEach(id => assert.strictEqual(example.platforms[id].enabled, true));
Object.keys(example.alerts.platforms).forEach(id => assert.ok(getSource(id)?.alertSourceTypes, `${id} can raise alerts`));

const topics = loadTopicSettings(example, path.join(__dirname, 'config.example.json'));
assert.deepStrictEqual(topics.categoryNames, ['Beauty']);
assert.ok(topics.categories[0].briefingExclude.includes('promo code'));

// Without a config: English example topics, and Google Trends and TikTok as main sources.
assert.strictEqual(defaultPresetName(), 'example-beauty');
assert.deepStrictEqual(defaultTopicSettings().categoryNames, ['Beauty']);
assert.deepStrictEqual(defaultSeedPlatforms(defaultPlatformsConfig()), ['google-trends', 'tiktok-creative-center']);
assert.deepStrictEqual(
  Object.entries(defaultPlatformsConfig()).filter(([, value]) => value.enabled).map(([id]) => id),
  ['google-trends', 'tiktok-creative-center', 'wikipedia']
);

// The self-check runs on the example config and reports the missing saved pages.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-config-'));
try {
  fs.copyFileSync(path.join(__dirname, 'config.example.json'), path.join(dataDir, 'config.json'));
  const env = { ...process.env, SIBYL_DATA_DIR: dataDir, SIBYL_CONFIG: '', SIBYL_SKIP_NETWORK_CHECK: '1' };
  ['SIBYL_ALERT_WEBHOOK', 'SIBYL_REPORT_WEBHOOK', 'WECOM_WEBHOOK', 'SIBYL_TELEGRAM_BOT_TOKEN'].forEach(key => delete env[key]);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'check-deploy.js'), '--strict'], { env, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes('[OK] Main sources: Google Trends, TikTok'));
  assert.ok(result.stdout.includes('[WARN] TikTok: Beauty & Personal Care: not in pages.json yet'));
  assert.ok(result.stdout.includes('[WARN] Google Trends Explore: sunscreen: not in pages.json yet'));
  assert.ok(result.stdout.includes('## Reading briefings'));
  // Files only is a supported setup: one OK line, no warnings about webhooks.
  assert.ok(result.stdout.includes('[OK] Push target: none: briefings and alerts are saved as files'));
  ['Alert push target', 'Briefing push target', 'Separate alert and briefing webhooks', 'No double pushes', 'Webhooks in scheduled tasks']
    .forEach(text => assert.ok(!result.stdout.includes(text), `no line about ${text} with files only`));
  // The daily reading line says which pages are out of date instead of always warning.
  assert.ok(result.stdout.includes('[WARN] Daily page reading: not read in the last 30 hours: TikTok: Beauty & Personal Care'));
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log('config example tests passed');
