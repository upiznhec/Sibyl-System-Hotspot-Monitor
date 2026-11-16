#!/usr/bin/env node

// Installs, shows or removes Sibyl's schedule (v1.3.20's): collection and alerts every 10 minutes
// and a briefing every hour, during the person's hours. On macOS and Linux it writes one marked block
// into the person's crontab and leaves every other entry alone. On Windows it prints what to set up
// in Task Scheduler. Keys come from data/.env, so the schedule holds no secrets. Agents use this
// instead of writing their own scheduler or wrapper scripts.
//
//   node scripts/schedule.js --install --hours=10-22   install or replace (also --every=10, --dry-run)
//   node scripts/schedule.js --status                  show what is installed (the default)
//   node scripts/schedule.js --remove                  take it out

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { getDataDir } = require('./lib/snapshot-store');
const { systemTimeZone } = require('./lib/locale');

const BEGIN = '# BEGIN Sibyl trend monitor (managed by scripts/schedule.js)';
const END = '# END Sibyl trend monitor';
const SIBYL_DIR = path.resolve(__dirname, '..');
const EVERY_CHOICES = [5, 10, 15, 20, 30, 60];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseHours(value = '10-22') {
  const match = String(value).trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) throw new Error(`hours must look like 10-22, not "${value}"`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23 || start > end) {
    throw new Error(`hours must be between 0 and 23, the first not after the second: "${value}"`);
  }
  return { start, end };
}

function parseEvery(value = '10') {
  const minutes = Number(value);
  if (!EVERY_CHOICES.includes(minutes)) throw new Error(`--every must be one of ${EVERY_CHOICES.join(', ')} minutes`);
  return minutes;
}

// The crontab block. The collection and the alert check run in turn; a source that fails is
// recorded and the others are still read, so one failing source never stops a run.
function buildCronBlock({ sibylDir = SIBYL_DIR, nodePath = process.execPath, dataDir = null, hours, every = 10 }) {
  const range = `${hours.start}-${hours.end}`;
  const minute = every === 60 ? '0' : `*/${every}`;
  const env = dataDir ? `SIBYL_DATA_DIR=${shellQuote(dataDir)} ` : '';
  const logDir = dataDir || path.join(sibylDir, 'data');
  const node = shellQuote(nodePath);
  const log = name => shellQuote(path.join(logDir, name));
  const cd = `cd ${shellQuote(sibylDir)}`;
  return [
    BEGIN,
    `${minute} ${range} * * * ${cd} && ${env}${node} scripts/collect-snapshot.js >> ${log('collect.log')} 2>&1 && ${env}${node} scripts/instant-alerts.js --push >> ${log('alerts.log')} 2>&1`,
    `0 ${range} * * * ${cd} && ${env}${node} scripts/sibyl.js --push >> ${log('briefing.log')} 2>&1`,
    END
  ].join('\n');
}

function blockBounds(lines) {
  const start = lines.findIndex(line => line.trim() === BEGIN);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && line.trim() === END);
  if (end < 0) throw new Error('the Sibyl block in the crontab has no end line; fix it by hand (crontab -e) first');
  return { start, end };
}

function installedBlock(crontab) {
  const lines = String(crontab || '').split('\n');
  const bounds = blockBounds(lines);
  return bounds ? lines.slice(bounds.start, bounds.end + 1).join('\n') : null;
}

function stripBlock(crontab) {
  const lines = String(crontab || '').split('\n');
  const bounds = blockBounds(lines);
  const kept = bounds ? [...lines.slice(0, bounds.start), ...lines.slice(bounds.end + 1)] : lines;
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function mergeCrontab(crontab, block) {
  const rest = stripBlock(crontab);
  return `${rest ? `${rest}\n` : ''}${block}\n`;
}

// macOS does not let scheduled tasks read Desktop, Documents, Downloads or iCloud Drive
// without extra permission, so the schedule would fail there without a word.
function protectedMacFolder(dir, home = os.homedir()) {
  const resolved = path.resolve(dir);
  for (const name of ['Desktop', 'Documents', 'Downloads', path.join('Library', 'Mobile Documents')]) {
    const base = path.join(home, name);
    if (resolved === base || resolved.startsWith(base + path.sep)) return name;
  }
  return null;
}

function timeZoneNote(configTimeZone, systemZone = systemTimeZone()) {
  if (!configTimeZone || configTimeZone === systemZone) return null;
  return `Note: this computer's time zone is ${systemZone}, but Sibyl's is ${configTimeZone}. ` +
    `The schedule follows the computer's clock, so give --hours in ${systemZone}.`;
}

function readCrontab() {
  const result = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  if (result.error) throw new Error(`crontab is not available here: ${result.error.message}`);
  if (result.status !== 0) {
    if (/no crontab/i.test(result.stderr || '')) return '';
    throw new Error(`crontab -l failed: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function writeCrontab(text) {
  const result = spawnSync('crontab', ['-'], { input: text, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`the crontab could not be written: ${String(result.stderr || result.error?.message || '').trim()}`);
  }
}

function readConfig(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
  } catch (error) {
    return {};
  }
}

function option(argv, name) {
  const found = argv.find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
}

function windowsGuide({ sibylDir, hours, every }) {
  const until = `${String(hours.end).padStart(2, '0')}:59`;
  const from = `${String(hours.start).padStart(2, '0')}:00`;
  return [
    'On Windows, create two tasks in Task Scheduler (this script does not change Windows settings):',
    `1. "Sibyl collection and alerts": daily, repeat every ${every} minutes from ${from} until ${until}.`,
    `   Program: ${process.execPath}`,
    '   Arguments: scripts\\collect-snapshot.js   (then a second action with: scripts\\instant-alerts.js --push)',
    `   Start in: ${sibylDir}`,
    `2. "Sibyl briefing": daily, repeat every hour from ${from} until ${until}.`,
    `   Program: ${process.execPath}`,
    '   Arguments: scripts\\sibyl.js --push',
    `   Start in: ${sibylDir}`,
    'Keys and webhook addresses stay in data\\.env; the tasks need no other settings.'
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const dataDirFromEnv = process.env.SIBYL_DATA_DIR || null;
  const config = readConfig(getDataDir());
  const note = timeZoneNote(config.timeZone);
  const install = argv.includes('--install');

  if (process.platform === 'win32') {
    console.log(windowsGuide({ sibylDir: SIBYL_DIR, hours: parseHours(option(argv, 'hours') || '10-22'), every: parseEvery(option(argv, 'every') || '10') }));
    if (note) console.log(note);
    return 0;
  }

  if (argv.includes('--remove')) {
    const current = readCrontab();
    if (!installedBlock(current)) {
      console.log('No Sibyl schedule is installed.');
      return 0;
    }
    const rest = stripBlock(current);
    writeCrontab(rest ? `${rest}\n` : '');
    console.log('Sibyl schedule removed. Other crontab entries were left as they were.');
    return 0;
  }

  if (install) {
    const hours = parseHours(option(argv, 'hours') || '10-22');
    const every = parseEvery(option(argv, 'every') || '10');
    if (process.platform === 'darwin') {
      const folder = protectedMacFolder(SIBYL_DIR) || (dataDirFromEnv && protectedMacFolder(dataDirFromEnv));
      if (folder) {
        console.error(`STOPPED: Sibyl is in your ${folder} folder (${SIBYL_DIR}). macOS does not let scheduled tasks read ` +
          'that folder, so the schedule would never run. Move the whole Sibyl folder to your home folder, for example ' +
          '~/Sibyl-System-Hotspot-Monitor, and run this again from there.');
        return 1;
      }
    }
    const block = buildCronBlock({ sibylDir: SIBYL_DIR, nodePath: process.execPath, dataDir: dataDirFromEnv, hours, every });
    if (argv.includes('--dry-run')) {
      console.log(block);
      if (note) console.log(note);
      return 0;
    }
    writeCrontab(mergeCrontab(readCrontab(), block));
    if (installedBlock(readCrontab()) !== block) {
      console.error('STOPPED: the schedule did not read back as written. Check it with: crontab -l');
      return 1;
    }
    console.log(`Sibyl schedule installed: collection and alerts every ${every} minutes, and a briefing every hour, ` +
      `from ${hours.start}:00 through hour ${hours.end} (this computer's clock).`);
    if (note) console.log(note);
    console.log('Page reading is not part of this schedule: the agent does it (AGENTS.md, "Reading the trend pages").');
    return 0;
  }

  const block = installedBlock(readCrontab());
  console.log(block
    ? `Installed:\n${block}`
    : 'No Sibyl schedule is installed. Install it with: node scripts/schedule.js --install --hours=10-22');
  if (note) console.log(note);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`STOPPED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  BEGIN,
  END,
  buildCronBlock,
  installedBlock,
  mergeCrontab,
  parseEvery,
  parseHours,
  protectedMacFolder,
  readCrontab,
  shellQuote,
  stripBlock,
  timeZoneNote
};
