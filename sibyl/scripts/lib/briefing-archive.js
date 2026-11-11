// Briefings and instant alerts are kept as Markdown files in the data folder:
//   briefings/YYYY-MM-DD_HHMM.md   one file per hourly briefing
//   alerts/YYYY-MM-DD.md           one file per day, alerts added as they come
// Dates are in the configured time zone. Files older than keepDays (default 7) are deleted.
// When no push target is set this is the only place briefings go: nothing is sent, and the
// user reads them by asking their agent, which runs scripts/show-briefing.js.

const fs = require('fs');
const path = require('path');

const { localClock, localDateKey } = require('./locale');

const DEFAULT_KEEP_DAYS = 7;

function folders(dataDir) {
  return {
    briefings: path.join(dataDir, 'briefings'),
    alerts: path.join(dataDir, 'alerts')
  };
}

function keepDaysOf(value) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_KEEP_DAYS;
}

// Deletes archived files dated more than keepDays days before today.
function pruneArchive(dataDir, keepDays = DEFAULT_KEEP_DAYS, now = new Date()) {
  const oldestKept = localDateKey(new Date(now.getTime() - keepDaysOf(keepDays) * 86400000));
  const removed = [];
  Object.values(folders(dataDir)).forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(name => {
      const date = name.slice(0, 10);
      if (!name.endsWith('.md') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if (date < oldestKept) {
        fs.unlinkSync(path.join(dir, name));
        removed.push(name);
      }
    });
  });
  return removed;
}

function saveBriefing(report, { dataDir, generatedAt = new Date(), keepDays } = {}) {
  const dir = folders(dataDir).briefings;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${localDateKey(generatedAt)}_${localClock(generatedAt).replace(':', '')}.md`);
  fs.writeFileSync(file, report);
  pruneArchive(dataDir, keepDays);
  return file;
}

function saveAlert(message, { dataDir, capturedAt = new Date(), keepDays } = {}) {
  const dir = folders(dataDir).alerts;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${localDateKey(capturedAt)}.md`);
  const hasText = fs.existsSync(file) && fs.statSync(file).size > 0;
  fs.appendFileSync(file, `${hasText ? '\n' : ''}${String(message).trim()}\n`);
  pruneArchive(dataDir, keepDays);
  return file;
}

// Saved briefings, newest first: [{ name, file }].
function listBriefings(dataDir) {
  const dir = folders(dataDir).briefings;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => /^\d{4}-\d{2}-\d{2}_\d{4}\.md$/.test(name))
    .sort()
    .reverse()
    .map(name => ({ name: name.replace(/\.md$/, ''), file: path.join(dir, name) }));
}

function alertsFile(dataDir, dateKey) {
  return path.join(folders(dataDir).alerts, `${dateKey}.md`);
}

module.exports = {
  DEFAULT_KEEP_DAYS,
  alertsFile,
  folders,
  listBriefings,
  pruneArchive,
  saveAlert,
  saveBriefing
};
