#!/usr/bin/env node

// source-cache: a 30-minute source is asked again by the run 30 minutes later, not the one after
// (runs come every 10 minutes, a few seconds apart from each other).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { cached } = require('./lib/source-cache');
const { wikipediaCacheMinutes } = require('./adapters/wikipedia-adapter');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibyl-cache-'));
const file = path.join(dir, 'source-cache', 'x-trends.json');
const saveAt = (minutesAgo, key = 'US') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ key, savedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(), items: ['old'] }));
};

async function main() {
  let calls = 0;
  const load = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return ['new'];
  };
  const options = { key: 'US', minutes: 30 };

  saveAt(20);
  assert.deepStrictEqual((await cached(dir, 'x-trends', options, load)).items, ['old'], '20 minutes old: still fresh');
  saveAt(29.9);
  assert.deepStrictEqual((await cached(dir, 'x-trends', options, load)).items, ['new'], 'the run 30 minutes later asks again');
  saveAt(5, 'GB');
  assert.deepStrictEqual((await cached(dir, 'x-trends', options, load)).items, ['new'], 'another key asks again');
  assert.strictEqual(calls, 2);

  // The time saved is when the request started.
  const before = Date.now();
  fs.rmSync(file);
  await cached(dir, 'x-trends', options, load);
  const savedAt = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).savedAt);
  assert.ok(savedAt >= before && savedAt < before + 25, 'saved with the start time, not the end time');

  // Wikipedia: one new list a day. Yesterday's list is kept until the next day; an older list
  // (Wikimedia has not published yesterday's yet) is looked at again after 6 hours.
  const key = 'US:en.wikipedia:50:2026-11-14';
  assert.strictEqual(wikipediaCacheMinutes({ key, items: { date: '2026-11-14' } }, key, '2026-11-14'), 24 * 60);
  assert.strictEqual(wikipediaCacheMinutes({ key, items: { date: '2026-11-13' } }, key, '2026-11-14'), 360);
  assert.strictEqual(wikipediaCacheMinutes({ key: 'US:en.wikipedia:50:2026-11-13', items: { date: '2026-11-13' } }, key, '2026-11-14'), 360);
  assert.strictEqual(wikipediaCacheMinutes(null, key, '2026-11-14'), 360);
}

main()
  .then(() => console.log('source cache tests passed'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
