#!/usr/bin/env node

const path = require('path');

const { sourceFetchers } = require('./lib/source-registry');
const {
  getDataDir,
  mergeConfig,
  readJson,
  saveSnapshot
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  platforms: {
    weibo: { enabled: true, maxItems: 50 },
    douyin: { enabled: true, maxItems: 50 },
    tieba: {
      enabled: true,
      maxItems: 50,
      hotTopicUrl: 'https://tieba.baidu.com/hottopic/browse/topicList?res_type=1'
    },
    hupu: {
      enabled: true,
      maxItems: 80,
      boards: [
        { board: '步行街', url: 'https://bbs.hupu.com/all-gambia', maxItems: 25 },
        { board: '英雄联盟', url: 'https://bbs.hupu.com/lol', maxItems: 25 },
        { board: 'NBA', url: 'https://bbs.hupu.com/nba', maxItems: 25 },
        { board: '国际足球', url: 'https://bbs.hupu.com/soccer', maxItems: 25 }
      ]
    }
  },
  snapshot: {
    maxAgeMinutes: 20,
    trendWindowMinutes: 70
  }
};

function loadConfig() {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  return mergeConfig(DEFAULT_CONFIG, readJson(configFile, {}));
}

function parsePlatforms(args) {
  const platformArg = args.find(arg => arg.startsWith('--platform='));
  if (!platformArg) return null;
  return platformArg.replace('--platform=', '').split(',').map(item => item.trim()).filter(Boolean);
}

async function collectPlatform(name, fetcher, platformConfig) {
  if (!platformConfig || platformConfig.enabled === false) {
    return { name, signals: [], skipped: true };
  }

  try {
    const signals = await fetcher(platformConfig);
    return { name, signals, skipped: false };
  } catch (error) {
    const partialSignals = Array.isArray(error.partialSignals) ? error.partialSignals : [];
    return {
      name,
      signals: partialSignals,
      skipped: false,
      error: error.message
    };
  }
}

async function collectSnapshot(options = {}) {
  const args = options.args || [];
  const config = options.config || loadConfig();
  const onlyPlatforms = options.platforms || parsePlatforms(args);
  const platformSet = onlyPlatforms ? new Set(onlyPlatforms) : null;
  const platformFetchers = sourceFetchers(config.platforms, platformSet);

  console.log('开始采集 Sibyl 统一快照...');
  const results = await Promise.all(platformFetchers.map(([name, fetcher, platformConfig]) =>
    collectPlatform(name, fetcher, platformConfig)
  ));

  const errors = results
    .filter(result => result.error)
    .map(result => ({ platform: result.name, message: result.error }));
  errors.forEach(error => console.warn(`⚠️ ${error.platform} 采集异常: ${error.message}`));

  const signals = results.flatMap(result => result.signals);
  const snapshot = saveSnapshot(signals, { errors });
  console.log('✅ Sibyl 快照采集完成');
  console.log(`   快照时间: ${snapshot.capturedAt}`);
  console.log(`   信号总数: ${snapshot.records.length}`);
  Object.entries(snapshot.counts).forEach(([platform, count]) => {
    console.log(`   ${platform}: ${count} 条`);
  });

  if (args.includes('--print')) {
    console.log(JSON.stringify(snapshot, null, 2));
  }

  return snapshot;
}

if (require.main === module) {
  collectSnapshot({ args: process.argv.slice(2) }).catch(error => {
    console.error('❌ Sibyl 快照采集失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  collectSnapshot
};
