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

// Returns the cached items when they are younger than minutes and were made with the same key
// (for example the same country and date); otherwise calls load() and caches its items.
async function cached(dataDir, sourceId, { key, minutes }, load) {
  const previous = dataDir ? readCache(dataDir, sourceId) : null;
  const fresh = previous &&
    previous.key === key &&
    Date.now() - Date.parse(previous.savedAt || 0) < minutes * 60000;
  if (fresh) return { items: previous.items, fromCache: true, savedAt: previous.savedAt };
  const items = await load();
  if (dataDir) writeCache(dataDir, sourceId, { key, savedAt: new Date().toISOString(), items });
  return { items, fromCache: false, savedAt: new Date().toISOString() };
}

module.exports = {
  cached
};
