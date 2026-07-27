#!/usr/bin/env node

const path = require('path');

const { summarizeContent } = require('../../elixir-summarizer/scripts/elixir-summarizer');
const { retrieveAgentReachEvidence } = require('./lib/agent-reach-retriever');
const {
  getDataDir,
  mergeConfig,
  readJson
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  retrieval: {
    health: {
      confirmationDelayMinutes: 30,
      firstOpenHours: 48,
      repeatOpenHours: 96,
      recoverySuccessesRequired: 2
    }
  },
  alerts: {
    agentReachSummary: {
      enabled: true,
      command: 'openclaw',
      agent: 'sibyl-retriever',
      sessionFlag: 'none',
      timeoutSeconds: 90,
      thinking: 'low',
      minSources: 2,
      minConfidence: 'medium',
      maxSources: 4,
      maxAgeHours: 96,
      maxEvidenceChars: 6000,
      capabilities: [
        'browser.search'
      ]
    }
  }
};

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function loadConfig() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  const config = mergeConfig(DEFAULT_CONFIG, readJson(configFile, {}));
  const timeoutSeconds = Number(option('timeout-seconds'));
  if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    config.alerts.agentReachSummary.timeoutSeconds = timeoutSeconds;
  }
  return config;
}

async function main() {
  const topic = option('topic');
  if (!topic) {
    console.error('用法：node scripts/test-retrieval-summary.js --topic="话题词" [--platform=douyin] [--category=体育] [--timeout-seconds=40]');
    process.exit(2);
  }

  const signal = {
    title: topic,
    platform: option('platform', 'douyin'),
    category: option('category', '体育'),
    url: option('url')
  };
  const retrieval = await retrieveAgentReachEvidence(signal, loadConfig());
  if (!retrieval.success) {
    console.log(JSON.stringify({
      success: false,
      topic,
      retrieval,
      elixir: {
        called: false,
        success: false,
        summary: '暂无摘要'
      },
      pushed: false
    }, null, 2));
    process.exit(1);
  }

  const elixirResult = await summarizeContent(retrieval.evidenceText, topic);
  const summary = String(elixirResult.summary || '').replace(/\s+/g, ' ').trim();
  const success = Boolean(summary && summary !== '暂无摘要' && !elixirResult.isCommercial);
  console.log(JSON.stringify({
    success,
    topic,
    retrieval: {
      routeUsed: retrieval.routeUsed,
      confidence: retrieval.confidence,
      sources: retrieval.sources
    },
    elixir: {
      called: true,
      success,
      summary: success ? summary : '暂无摘要',
      filtered: Boolean(elixirResult.isCommercial),
      reason: elixirResult.reason || null
    },
    pushed: false
  }, null, 2));

  if (!success) process.exit(1);
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    error: error.message,
    pushed: false
  }, null, 2));
  process.exit(1);
});
