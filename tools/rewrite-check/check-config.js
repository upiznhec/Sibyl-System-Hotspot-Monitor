// The config used by the rewrite check: the v1.3.20 example config plus the settings that
// select the v1.3.20 behaviour in the rewritten code (Chinese wording, Beijing time, the
// v1.3.20 topics). v1.3.20 itself ignores these keys, so both versions read the same file.

const fs = require('fs');
const path = require('path');

const V1320_SETTINGS = {
  language: 'zh',
  timeZone: 'Asia/Shanghai',
  topics: 'zh-v1.3.20'
};

function checkConfig(fixturesDir) {
  const config = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'config.json'), 'utf8'));
  return { ...config, ...V1320_SETTINGS };
}

function writeCheckConfig(fixturesDir, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(checkConfig(fixturesDir), null, 2));
}

module.exports = {
  V1320_SETTINGS,
  checkConfig,
  writeCheckConfig
};
