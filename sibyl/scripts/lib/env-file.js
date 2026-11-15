// The person's keys and webhook addresses live in sibyl/data/.env (or SIBYL_DATA_DIR/.env), readable
// only by their own account and never uploaded by git (the data folder is ignored). Every script reads
// it when it starts, so scheduled tasks carry no secrets. Lines are NAME=value or export NAME=value;
// surrounding quotes are removed. A variable already set in the environment wins.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./snapshot-store');

const ENV_FILE = '.env';

function parseEnvText(text) {
  const values = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function envFilePath(dataDir = getDataDir()) {
  return path.join(dataDir, ENV_FILE);
}

function loadEnvFile(dataDir = getDataDir()) {
  const file = envFilePath(dataDir);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { file, exists: false, loaded: [] };
  }
  const loaded = [];
  for (const [name, value] of Object.entries(parseEnvText(text))) {
    if (process.env[name] === undefined || process.env[name] === '') {
      process.env[name] = value;
      loaded.push(name);
    }
  }
  return { file, exists: true, loaded };
}

// True when only the owner can read the file (mode 600 or stricter), or when there is no file.
// Windows has no such mode bits, so it is always true there.
function envFileIsPrivate(dataDir = getDataDir()) {
  if (process.platform === 'win32') return true;
  try {
    return (fs.statSync(envFilePath(dataDir)).mode & 0o077) === 0;
  } catch (error) {
    return true;
  }
}

module.exports = {
  ENV_FILE,
  envFileIsPrivate,
  envFilePath,
  loadEnvFile,
  parseEnvText
};
