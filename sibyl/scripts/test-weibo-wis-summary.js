#!/usr/bin/env node

const path = require('path');

const { summarizeContent } = require('../../elixir-summarizer/scripts/elixir-summarizer');
const { getDataDir, mergeConfig, readJson } = require('./lib/snapshot-store');
const { getWeiboToken, searchWeiboAI } = require('./lib/weibo-wis');

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function loadConfig() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  return mergeConfig({}, readJson(configFile, {}));
}

async function main() {
  const topic = option('topic');
  if (!topic) {
    console.error('用法：node scripts/test-weibo-wis-summary.js --topic="话题词"');
    process.exit(2);
  }

  const config = loadConfig();
  const token = await getWeiboToken(config);
  if (!token) {
    console.log(JSON.stringify({
      success: false,
      topic,
      source: 'weibo-wis',
      failureReason: 'weibo_wis_not_configured',
      pushed: false
    }, null, 2));
    process.exit(1);
  }

  const content = await searchWeiboAI(topic, token, config);
  if (!content) {
    console.log(JSON.stringify({
      success: false,
      topic,
      source: 'weibo-wis',
      failureReason: 'weibo_wis_no_content',
      pushed: false
    }, null, 2));
    process.exit(1);
  }

  const result = await summarizeContent(content, topic);
  const summary = String(result.summary || '').replace(/\s+/g, ' ').trim();
  const success = Boolean(summary && summary !== '暂无摘要' && !result.isCommercial);
  console.log(JSON.stringify({
    success,
    topic,
    source: 'weibo-wis-elixir',
    summary: success ? summary : '暂无摘要',
    filtered: Boolean(result.isCommercial),
    failureReason: success ? null : (result.reason || 'elixir_empty_summary'),
    pushed: false
  }, null, 2));

  if (!success) process.exit(1);
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    source: 'weibo-wis',
    failureReason: error.message,
    pushed: false
  }, null, 2));
  process.exit(1);
});
