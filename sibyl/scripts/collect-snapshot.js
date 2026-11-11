#!/usr/bin/env node

const path = require('path');

const { defaultPlatformsConfig, sourceFetchers } = require('./lib/source-registry');
const { configureLocale } = require('./lib/locale');
const { configureHttp } = require('./lib/http');
const { loadPages } = require('./lib/pages-file');
const { loadTopicSettings } = require('./lib/topic-settings');
const {
  getDataDir,
  mergeConfig,
  readJson,
  saveSnapshot
} = require('./lib/snapshot-store');

const DEFAULT_CONFIG = {
  // Google Trends, TikTok and Wikipedia are on; sources that need channels, feeds or a key are
  // off until set up. See each adapter in adapters/.
  platforms: defaultPlatformsConfig(),
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

// What adapters may need besides their own settings: the country, the data folder, the pages
// the agent saved (pages.json) and the user's topics.
function collectContext(config) {
  const dataDir = getDataDir();
  const configFile = process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json');
  return {
    config,
    dataDir,
    pages: loadPages(config, dataDir),
    topicSettings: loadTopicSettings(config, configFile)
  };
}

function logPages(pages, platformsConfig = {}) {
  const usesPages = ['google-trends', 'tiktok-creative-center'].some(id => platformsConfig[id]?.enabled);
  if (!usesPages) return;
  pages.sections.forEach(section => {
    console.log(`   pages.json: ${section.source}${section.view ? `/${section.view}` : ''} read ${section.ageHours} h ago, ${section.items.length} items`);
  });
  pages.problems.forEach(problem => console.warn(`⚠️ pages.json: ${problem}`));
}

async function collectPlatform(name, fetcher, platformConfig, context = {}) {
  if (!platformConfig || platformConfig.enabled === false) {
    return { name, signals: [], skipped: true };
  }

  try {
    const signals = await fetcher(platformConfig, context);
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
  configureLocale(config);
  configureHttp(config.http || {});
  const context = collectContext(config);
  const onlyPlatforms = options.platforms || parsePlatforms(args);
  const platformSet = onlyPlatforms ? new Set(onlyPlatforms) : null;
  const platformFetchers = sourceFetchers(config.platforms, platformSet);

  console.log('Collecting a Sibyl snapshot...');
  logPages(context.pages, config.platforms);
  const results = await Promise.all(platformFetchers.map(([name, fetcher, platformConfig]) =>
    collectPlatform(name, fetcher, platformConfig, context)
  ));

  const errors = results
    .filter(result => result.error)
    .map(result => ({ platform: result.name, message: result.error }));
  errors.forEach(error => console.warn(`⚠️ ${error.platform} could not be read: ${error.message}`));

  const signals = results.flatMap(result => result.signals);
  const snapshot = saveSnapshot(signals, { errors });
  console.log('✅ Sibyl snapshot saved');
  console.log(`   Time: ${snapshot.capturedAt}`);
  console.log(`   Items: ${snapshot.records.length}`);
  Object.entries(snapshot.counts).forEach(([platform, count]) => {
    console.log(`   ${platform}: ${count}`);
  });

  if (args.includes('--print')) {
    console.log(JSON.stringify(snapshot, null, 2));
  }

  return snapshot;
}

if (require.main === module) {
  collectSnapshot({ args: process.argv.slice(2) }).catch(error => {
    console.error('❌ Sibyl snapshot failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  collectContext,
  collectPlatform,
  collectSnapshot
};
