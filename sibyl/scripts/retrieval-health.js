#!/usr/bin/env node

const path = require('path');

const {
  DEFAULT_POLICY,
  disableCapability,
  healthFile,
  listCapabilities,
  listDueProbes,
  loadHealthState,
  normalizePolicy,
  recordFailure,
  recordSuccess,
  resetCapability,
  saveHealthState,
  selectCapability
} = require('./lib/retrieval-health');
const {
  getDataDir,
  mergeConfig,
  readJson
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  retrieval: {
    health: DEFAULT_POLICY,
    capabilities: [
      'openclaw.agent.sibyl-retriever',
      'browser.search',
      'web_fetch.read'
    ]
  }
};

function loadConfig() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  return mergeConfig(DEFAULT_CONFIG, readJson(configFile, {}));
}

function optionValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function positionalArgs() {
  return process.argv.slice(3).filter(value => !value.startsWith('--'));
}

function configuredCapabilities(config) {
  const capabilities = config.retrieval?.capabilities;
  return Array.isArray(capabilities) ? capabilities.filter(Boolean) : [];
}

function output(value, asJson) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      console.log('无');
      return;
    }
    value.forEach(item => {
      const availability = item.availability || {};
      const retry = item.retryAfter ? `，下次探测 ${item.retryAfter}` : '';
      console.log(`${item.id}: ${item.status}，可用=${availability.canUse ? '是' : '否'}${retry}`);
    });
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function usage() {
  console.log(`Sibyl 检索能力状态管理

用法：
  node scripts/retrieval-health.js status [--json]
  node scripts/retrieval-health.js select [capability ...] [--json]
  node scripts/retrieval-health.js probe-due [capability ...] [--json]
  node scripts/retrieval-health.js success <capability> [--latency-ms=123] [--json]
  node scripts/retrieval-health.js failure <capability> --type=timeout [--reason=...] [--retry-after=ISO] [--json]
  node scripts/retrieval-health.js disable <capability> [--reason=...] [--json]
  node scripts/retrieval-health.js reset <capability> [--json]

常见故障类型：
  timeout, network, rate_limit, parse, auth, forbidden, anti_bot,
  not_configured, no_results, topic_miss, page_error
`);
}

function main() {
  const command = process.argv[2] || 'status';
  const asJson = process.argv.includes('--json');
  const config = loadConfig();
  const policy = normalizePolicy(config.retrieval?.health);
  const state = loadHealthState();
  const defaults = configuredCapabilities(config);
  const args = positionalArgs();
  const ids = args.length ? args : defaults;
  const common = { policy };
  let result;
  let changed = false;

  if (command === 'status') {
    result = {
      file: healthFile(),
      policy,
      capabilities: listCapabilities(state, ids)
    };
  } else if (command === 'select') {
    result = selectCapability(state, ids);
  } else if (command === 'probe-due') {
    result = listDueProbes(state, ids);
  } else if (command === 'success') {
    const id = args[0];
    if (!id) return usage();
    result = recordSuccess(state, id, {
      ...common,
      latencyMs: optionValue('latency-ms')
    });
    changed = true;
  } else if (command === 'failure') {
    const id = args[0];
    if (!id || !optionValue('type')) return usage();
    result = recordFailure(state, id, {
      ...common,
      failureType: optionValue('type'),
      reason: optionValue('reason'),
      retryAfter: optionValue('retry-after'),
      latencyMs: optionValue('latency-ms')
    });
    changed = true;
  } else if (command === 'disable') {
    const id = args[0];
    if (!id) return usage();
    result = disableCapability(state, id, optionValue('reason') || 'manual');
    changed = true;
  } else if (command === 'reset') {
    const id = args[0];
    if (!id) return usage();
    result = resetCapability(state, id);
    changed = true;
  } else {
    return usage();
  }

  if (changed) saveHealthState(state);
  output(result, asJson);
}

main();
