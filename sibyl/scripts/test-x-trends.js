#!/usr/bin/env node

// X trends: the endpoint returns names only (tested live on 2026-11-15). A missing count stays
// unknown and is shown as nothing, never as "0 posts".

const assert = require('assert');

const { trendItems } = require('./adapters/x-trends-adapter');
const { formatSignalBrief, makeSignal } = require('./lib/signals');
const en = require('./lib/lang/en');

// What the live endpoint returned: names only.
assert.deepStrictEqual(trendItems({ data: [{ trend_name: 'Bears' }, { trend_name: ' ' }, { trend_name: '#SundayFunday' }] }), [
  { name: 'Bears', posts: null },
  { name: '#SundayFunday', posts: null }
]);
// If X ever sends a count, it is used.
assert.deepStrictEqual(trendItems({ data: [{ trend_name: 'Sunscreen', tweet_count: 12000 }] }), [{ name: 'Sunscreen', posts: 12000 }]);
assert.deepStrictEqual(trendItems({}), []);

const signal = makeSignal({ platform: 'x-trends', sourceType: 'x_trend', title: 'Bears', rank: 2, heat: null });
assert.strictEqual(signal.heat, 0);
assert.ok(!/posts/.test(formatSignalBrief({ ...signal, platformLabel: 'X' })), 'no count in the briefing line');

const { rankHeat } = en.alert;
assert.strictEqual(rankHeat(2, ''), 'Rank: #2', 'no "Heat: 0 posts" in alerts');
assert.strictEqual(rankHeat(1, '20K+ searches'), 'Rank: #1 | Heat: 20K+ searches');

console.log('x trends tests passed');
