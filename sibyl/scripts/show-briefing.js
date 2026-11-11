#!/usr/bin/env node

// Shows saved briefings and alerts. The user's agent runs this when the user asks, for example
// "Show me the latest trend briefing" or "Any trend alerts today?". Nothing is shown otherwise.
//
//   node scripts/show-briefing.js                         the latest briefing
//   node scripts/show-briefing.js --list                  saved briefings (kept 7 days)
//   node scripts/show-briefing.js --file=2026-11-11_1000  one saved briefing
//   node scripts/show-briefing.js --alerts                today's alerts
//   node scripts/show-briefing.js --alerts --date=2026-11-10

const fs = require('fs');
const path = require('path');

const { alertsFile, listBriefings } = require('./lib/briefing-archive');
const { configureLocale, localDateKey } = require('./lib/locale');
const { getDataDir, readJson } = require('./lib/snapshot-store');

function argValue(name) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : '';
}

function main() {
  const dataDir = getDataDir();
  const config = readJson(process.env.SIBYL_CONFIG || path.join(dataDir, 'config.json'), {});
  configureLocale(config);
  const args = process.argv.slice(2);

  if (args.includes('--alerts')) {
    const date = argValue('date') || localDateKey();
    const file = alertsFile(dataDir, date);
    if (!fs.existsSync(file)) {
      console.log(`No alerts saved for ${date}.`);
      return;
    }
    console.log(fs.readFileSync(file, 'utf8').trim());
    return;
  }

  const briefings = listBriefings(dataDir);
  if (args.includes('--list')) {
    if (!briefings.length) {
      console.log('No briefings saved yet.');
      return;
    }
    briefings.forEach(item => console.log(item.name));
    return;
  }

  const wanted = argValue('file');
  const briefing = wanted ? briefings.find(item => item.name === wanted.replace(/\.md$/, '')) : briefings[0];
  if (!briefing) {
    console.log(wanted ? `No saved briefing named ${wanted}.` : 'No briefings saved yet.');
    return;
  }
  console.log(fs.readFileSync(briefing.file, 'utf8').trim());
}

main();
