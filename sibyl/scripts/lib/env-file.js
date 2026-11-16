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

// Removes every line for NAME (with or without "export") and keeps the rest.
function unsetEnvValue(text, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name))) throw new Error(`Not a variable name: ${name}`);
  const earlier = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const kept = String(text || '').split(/\r?\n/).filter(line => !earlier.test(line));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.length ? `${kept.join('\n')}\n` : '';
}

// Sets NAME=value, replacing any earlier line for NAME (with or without "export") and keeping the rest.
function setEnvValue(text, name, value) {
  if (/[\r\n]/.test(String(value))) throw new Error('The value must be one line.');
  return `${unsetEnvValue(text, name)}${name}=${value}\n`;
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

function readEnvText(dataDir = getDataDir()) {
  try {
    return fs.readFileSync(envFilePath(dataDir), 'utf8');
  } catch (error) {
    return '';
  }
}

// The saved values, without touching process.env.
function readEnvValues(dataDir = getDataDir()) {
  return parseEnvText(readEnvText(dataDir));
}

// Writes the whole file in one step (cron never reads half a file), readable only by the owner.
function writeEnvText(dataDir, text) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = envFilePath(dataDir);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text, { mode: 0o600 });
  fs.renameSync(temp, file);
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
  return file;
}

// Writes NAME=value into the .env file. Used by save-secret.js, which the person runs so that a key
// never passes through a chat.
function writeEnvValue(dataDir, name, value) {
  return writeEnvText(dataDir, setEnvValue(readEnvText(dataDir), name, value));
}

// Removes NAME from the .env file; false when it was not there.
function removeEnvValue(dataDir, name) {
  const text = readEnvText(dataDir);
  if (!Object.prototype.hasOwnProperty.call(parseEnvText(text), name)) return false;
  writeEnvText(dataDir, unsetEnvValue(text, name));
  return true;
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
  parseEnvText,
  readEnvValues,
  removeEnvValue,
  setEnvValue,
  unsetEnvValue,
  writeEnvValue
};
