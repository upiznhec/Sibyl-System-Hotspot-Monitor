// Keeps the last result of a source in the data folder, so that sources which change slowly
// (Wikipedia: once a day) or cost money per request (X) are not requested on every 10-minute run.

const fs = require('fs');
const path = require('path');

function cacheFile(dataDir, sourceId) {
  return path.join(dataDir, 'source-cache', `${sourceId}.json`);
}

function readCache(dataDir, sourceId) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(dataDir, sourceId), 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeCache(dataDir, sourceId, value) {
  const file = cacheFile(dataDir, sourceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// The scheduled runs come every 10 minutes and start a few seconds late or early, so a result
// counts as due up to 2 minutes before its interval ends. Without this, a 30-minute interval
// became about 40 minutes (the run 30 minutes later found the result a few seconds too young).
const DUE_EARLY_MS = 2 * 60000;

// Returns the cached items when they are younger than minutes and were made with the same key
// (for example the same country and date); otherwise calls load() and caches its items. The time
// saved is when the request started, not when it ended.
async function cached(dataDir, sourceId, { key, minutes }, load) {
  const previous = dataDir ? readCache(dataDir, sourceId) : null;
  const ageMs = Date.now() - Date.parse(previous?.savedAt || 0);
  const fresh = previous &&
    previous.key === key &&
    ageMs < Math.max(minutes * 60000 - DUE_EARLY_MS, minutes * 30000);
  if (fresh) return { items: previous.items, fromCache: true, savedAt: previous.savedAt };
  const startedAt = new Date().toISOString();
  const items = await load();
  if (dataDir) writeCache(dataDir, sourceId, { key, savedAt: startedAt, items });
  return { items, fromCache: false, savedAt: startedAt };
}

module.exports = {
  cached
};
