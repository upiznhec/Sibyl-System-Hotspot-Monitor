#!/usr/bin/env node

// Briefing and alert files: names in the configured time zone, the 7-day cleanup, and the
// show-briefing command that the agent runs when the user asks.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { configureLocale, localDateKey } = require('./lib/locale');
const {
  alertsFile,
  listBriefings,
  pruneArchive,
  saveAlert,
  saveBriefing
} = require('./lib/briefing-archive');

const TIME_ZONE = 'America/Los_Angeles';
configureLocale({ language: 'en', timeZone: TIME_ZONE });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-archive-'));
const day = 86400000;

function show(...args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'show-briefing.js'), ...args], {
    env: { ...process.env, SIBYL_DATA_DIR: dataDir, SIBYL_CONFIG: '' },
    encoding: 'utf8'
  });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

try {
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ timeZone: TIME_ZONE }));
  assert.strictEqual(show(), 'No briefings saved yet.');

  const now = new Date();
  const today = localDateKey(now);
  const file = saveBriefing('# Trend Briefing\n\nfirst\n', { dataDir, generatedAt: now });
  assert.ok(new RegExp(`^${today}_\\d{4}\\.md$`).test(path.basename(file)));
  saveAlert('🔥 alert one\n', { dataDir, capturedAt: now });
  saveAlert('🔥 alert two', { dataDir, capturedAt: now });
  assert.strictEqual(fs.readFileSync(alertsFile(dataDir, today), 'utf8'), '🔥 alert one\n\n🔥 alert two\n');

  // The agent's command shows the latest briefing, the list, and alerts only when asked.
  assert.strictEqual(show(), '# Trend Briefing\n\nfirst');
  assert.strictEqual(show('--list'), path.basename(file, '.md'));
  assert.strictEqual(show('--alerts'), '🔥 alert one\n\n🔥 alert two');
  assert.strictEqual(show('--alerts', '--date=1999-01-01'), 'No alerts saved for 1999-01-01.');
  assert.strictEqual(show('--file=2000-01-01_0000'), 'No saved briefing named 2000-01-01_0000.');

  // Cleanup: files dated more than 7 days before today go; the rest stay.
  const dated = daysBack => localDateKey(new Date(now.getTime() - daysBack * day));
  ['briefings', 'alerts'].forEach(folder => {
    fs.writeFileSync(path.join(dataDir, folder, `${dated(7)}${folder === 'briefings' ? '_0900' : ''}.md`), 'seven days old');
    fs.writeFileSync(path.join(dataDir, folder, `${dated(8)}${folder === 'briefings' ? '_0900' : ''}.md`), 'eight days old');
  });
  fs.writeFileSync(path.join(dataDir, 'briefings', 'notes.md'), 'not an archive file');
  const removed = pruneArchive(dataDir, 7, now).sort();
  assert.deepStrictEqual(removed, [`${dated(8)}.md`, `${dated(8)}_0900.md`]);
  assert.deepStrictEqual(listBriefings(dataDir).map(item => item.name), [path.basename(file, '.md'), `${dated(7)}_0900`]);
  assert.ok(fs.existsSync(path.join(dataDir, 'briefings', 'notes.md')));
  assert.strictEqual(pruneArchive(dataDir, 30, now).length, 0);

  console.log('briefing archive tests passed');
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
