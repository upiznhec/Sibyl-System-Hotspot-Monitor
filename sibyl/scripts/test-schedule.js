#!/usr/bin/env node

// scripts/schedule.js: the crontab block it writes and how it keeps other entries.
// Nothing here reads or changes the real crontab.

const assert = require('assert');

const {
  BEGIN,
  END,
  buildCronBlock,
  installedBlock,
  mergeCrontab,
  otherFolders,
  parseEvery,
  parseHours,
  protectedMacFolder,
  shellQuote,
  stripBlock
} = require('./schedule');

assert.deepStrictEqual(parseHours('10-22'), { start: 10, end: 22 });
assert.deepStrictEqual(parseHours(' 5 - 23 '), { start: 5, end: 23 });
assert.throws(() => parseHours('22-10'));
assert.throws(() => parseHours('10:00-22:00'));
assert.throws(() => parseHours('10-24'));
assert.strictEqual(parseEvery('10'), 10);
assert.strictEqual(parseEvery('60'), 60);
assert.throws(() => parseEvery('7'));
assert.strictEqual(shellQuote("it's"), "'it'\\''s'");

// The block: full paths in quotes, the two v1.3.20 tasks, and no secrets.
const block = buildCronBlock({
  sibylDir: '/Users/a b/Sibyl/sibyl',
  nodePath: '/usr/local/bin/node',
  hours: { start: 10, end: 22 },
  every: 10
});
const lines = block.split('\n');
assert.strictEqual(lines.length, 4);
assert.strictEqual(lines[0], BEGIN);
assert.strictEqual(lines[3], END);
assert.ok(lines[1].startsWith("*/10 10-22 * * * cd '/Users/a b/Sibyl/sibyl' && '/usr/local/bin/node' scripts/collect-snapshot.js"), lines[1]);
assert.ok(lines[1].includes("&& '/usr/local/bin/node' scripts/instant-alerts.js --push >> '/Users/a b/Sibyl/sibyl/data/alerts.log' 2>&1"), lines[1]);
assert.ok(lines[2].startsWith("0 10-22 * * * cd '/Users/a b/Sibyl/sibyl' && '/usr/local/bin/node' scripts/sibyl.js --push"), lines[2]);
assert.ok(!/KEY|TOKEN|WEBHOOK/.test(block), 'the schedule holds no secrets');

const hourly = buildCronBlock({ sibylDir: '/s', nodePath: '/n', hours: { start: 9, end: 17 }, every: 60 });
assert.ok(hourly.split('\n')[1].startsWith('0 9-17 * * * '));
const otherData = buildCronBlock({ sibylDir: '/s', nodePath: '/n', dataDir: '/d', hours: { start: 9, end: 17 } });
assert.ok(otherData.includes("SIBYL_DATA_DIR='/d' '/n' scripts/sibyl.js"));
assert.ok(otherData.includes("'/d/briefing.log'"));

// Other entries stay; reinstalling replaces the folder's block instead of adding a second one.
const dir = '/Users/a b/Sibyl/sibyl';
const existing = '# my jobs\n0 7 * * * echo morning\n';
const merged = mergeCrontab(existing, block);
assert.ok(merged.startsWith(`# my jobs\n0 7 * * * echo morning\n${BEGIN}`));
assert.strictEqual(installedBlock(merged, dir), block);
const sameFolder = buildCronBlock({ sibylDir: dir, nodePath: '/n', hours: { start: 9, end: 17 }, every: 60 });
const reinstalled = mergeCrontab(merged, sameFolder);
assert.strictEqual(reinstalled.split(BEGIN).length - 1, 1);
assert.strictEqual(installedBlock(reinstalled, dir), sameFolder);
assert.strictEqual(stripBlock(reinstalled, dir), '# my jobs\n0 7 * * * echo morning');
assert.strictEqual(installedBlock(existing, dir), null);
assert.strictEqual(mergeCrontab('', block), `${block}\n`);
assert.throws(() => installedBlock(`${BEGIN}\n* * * * * x\n`, dir), /no end line/);

// A second Sibyl folder (for example a second test on the same computer) keeps its own block:
// installing or removing one folder's schedule leaves the other's alone.
const both = mergeCrontab(reinstalled, hourly);
assert.strictEqual(both.split(BEGIN).length - 1, 2);
assert.strictEqual(installedBlock(both, dir), sameFolder);
assert.strictEqual(installedBlock(both, '/s'), hourly);
assert.deepStrictEqual(otherFolders(both, '/s'), [dir]);
assert.strictEqual(stripBlock(both, '/s'), `# my jobs\n0 7 * * * echo morning\n${sameFolder}`);
const replacedOne = mergeCrontab(both, otherData);
assert.strictEqual(replacedOne.split(BEGIN).length - 1, 2);
assert.strictEqual(installedBlock(replacedOne, '/s'), otherData);
assert.strictEqual(installedBlock(replacedOne, dir), sameFolder);
const quoted = buildCronBlock({ sibylDir: "/Users/o'neil/sibyl", nodePath: '/n', hours: { start: 9, end: 17 } });
assert.strictEqual(installedBlock(mergeCrontab(both, quoted), "/Users/o'neil/sibyl"), quoted);

// macOS folders a scheduled task cannot read.
const home = '/Users/someone';
assert.strictEqual(protectedMacFolder('/Users/someone/Desktop/DSM 596/Sibyl/sibyl', home), 'Desktop');
assert.strictEqual(protectedMacFolder('/Users/someone/Documents', home), 'Documents');
assert.strictEqual(protectedMacFolder('/Users/someone/Downloads/Sibyl', home), 'Downloads');
assert.strictEqual(protectedMacFolder('/Users/someone/Sibyl-System-Hotspot-Monitor/sibyl', home), null);
assert.strictEqual(protectedMacFolder('/Users/someone/DesktopStuff/Sibyl', home), null);

console.log('schedule tests passed');
