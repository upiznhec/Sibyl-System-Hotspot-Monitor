#!/usr/bin/env node
// Checks that the values moved into adapters and the topic preset equal the constants
// hard-coded in v1.3.20. It copies the original modules, exposes their private
// constants, and compares them with the source registry and the preset.
//
// Usage: node tools/rewrite-check/check-constants.js --baseline <v1.3.20 tree>

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = process.argv.indexOf('--baseline');
if (index === -1) {
  console.error('Usage: node check-constants.js --baseline <v1.3.20 tree>');
  process.exit(2);
}
const baseline = path.resolve(process.argv[index + 1]);
const repo = path.resolve(__dirname, '..', '..');

function exposeConstants(relativeFile, names) {
  const file = path.join(baseline, relativeFile);
  const copy = file.replace(/\.js$/, '.constants-check.js');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(copy, `${source}\nmodule.exports.__constants = { ${names.join(', ')} };\n`);
  try {
    return require(copy).__constants;
  } finally {
    fs.rmSync(copy, { force: true });
  }
}

const original = {
  ...exposeConstants('sibyl/scripts/lib/clusterer.js', ['PLATFORM_WEIGHTS', 'PLATFORM_LABELS', 'SOURCE_TYPE_WEIGHT']),
  ...exposeConstants('sibyl/scripts/lib/report-generator.js', [
    'CATEGORY_ICON', 'BASKETBALL_HINTS', 'FOOTBALL_HINTS', 'KNOWN_TOPIC_TERMS', 'DEFAULT_BROADCAST_SEED_PLATFORMS'
  ]),
  ...exposeConstants('sibyl/scripts/lib/category-classifier.js', [
    'CATEGORY_GROUPS', 'CATEGORY_PRIORITY', 'BOARD_CATEGORY_HINTS', 'AMBIGUOUS_GAME_WORDS', 'NON_TARGET_PRODUCT_HINTS'
  ])
};

const registry = require(path.join(repo, 'sibyl/scripts/lib/source-registry'));
const { defaultTopicSettings } = require(path.join(repo, 'sibyl/scripts/lib/topic-settings'));
const settings = defaultTopicSettings();
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push(`ok   ${name}`);
  } catch (error) {
    checks.push(`FAIL ${name}: ${error.message}`);
  }
}

const regexKey = regex => `${regex.source}/${regex.flags}`;

check('platform weights', () => {
  for (const [id, weight] of Object.entries(original.PLATFORM_WEIGHTS)) {
    assert.strictEqual(registry.sourceWeight(id), weight, id);
  }
});
check('platform labels', () => {
  for (const [id, label] of Object.entries(original.PLATFORM_LABELS)) {
    assert.strictEqual(registry.sourceLabel(id), label, id);
  }
});
check('list-type weights', () => {
  for (const [type, weight] of Object.entries(original.SOURCE_TYPE_WEIGHT)) {
    assert.strictEqual(registry.sourceTypeWeight(type), weight, type);
  }
  assert.strictEqual(registry.sourceTypeWeight('unknown'), 0.8);
});
check('board boost', () => {
  assert.strictEqual(registry.sourceTypeBoost('board_hot'), 4);
  assert.strictEqual(registry.sourceTypeBoost('hot_search'), 0);
});
check('display order', () => {
  assert.deepStrictEqual(
    ['weibo', 'douyin', 'hupu', 'tieba', 'unknown'].map(registry.displayOrder),
    [0, 1, 2, 3, 9]
  );
});
// Only the four v1.3.20 sources are compared; the sources added later have no v1.3.20 values.
const V1320_SOURCES = new Set(['weibo', 'douyin', 'tieba', 'hupu']);
const v1320Only = ids => ids.filter(id => V1320_SOURCES.has(id));

check('default main sources', () => {
  assert.deepStrictEqual(v1320Only(registry.defaultSeedPlatforms()), original.DEFAULT_BROADCAST_SEED_PLATFORMS);
});
check('community sources', () => {
  assert.deepStrictEqual(
    v1320Only(registry.SOURCE_ORDER.filter(registry.isCommunitySource)),
    ['tieba', 'hupu']
  );
});
check('link order', () => {
  assert.deepStrictEqual(v1320Only(registry.linkSources().map(source => source.id)), ['weibo', 'douyin', 'hupu']);
});
check('category groups and order', () => {
  assert.deepStrictEqual(
    Object.fromEntries(settings.categories.map(category => [category.name, category.groups])),
    original.CATEGORY_GROUPS
  );
  assert.deepStrictEqual(settings.categories.map(category => category.name), Object.keys(original.CATEGORY_GROUPS));
});
check('category priority', () => {
  assert.deepStrictEqual(settings.priority, original.CATEGORY_PRIORITY);
});
check('board hints', () => {
  assert.deepStrictEqual(
    settings.boardHints.map(hint => [regexKey(hint.pattern), hint.category]),
    original.BOARD_CATEGORY_HINTS.map(hint => [regexKey(hint.pattern), hint.category])
  );
});
check('product noise rule', () => {
  assert.strictEqual(settings.productNoise.category, '游戏');
  assert.strictEqual(regexKey(settings.productNoise.pattern), regexKey(original.NON_TARGET_PRODUCT_HINTS));
  assert.deepStrictEqual([...settings.productNoise.ambiguousWords], [...original.AMBIGUOUS_GAME_WORDS]);
});
check('category icons', () => {
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(settings.icons).sort()),
    Object.fromEntries(Object.entries(original.CATEGORY_ICON).sort())
  );
});
check('basketball and football rules', () => {
  const sports = settings.categories.find(category => category.name === '体育');
  assert.deepStrictEqual(
    sports.subcategories.map(sub => [sub.name, regexKey(sub.pattern)]),
    [['篮球', regexKey(original.BASKETBALL_HINTS)], ['足球', regexKey(original.FOOTBALL_HINTS)]]
  );
});
check('known topic terms', () => {
  assert.deepStrictEqual(settings.knownTerms, original.KNOWN_TOPIC_TERMS);
});

checks.forEach(line => console.log(line));
const failed = checks.filter(line => line.startsWith('FAIL')).length;
console.log(failed ? `${failed} check(s) failed.` : `All ${checks.length} constant checks passed.`);
process.exit(failed ? 1 : 0);
