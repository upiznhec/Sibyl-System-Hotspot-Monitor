#!/usr/bin/env node

// Saves the pages the agent read today into data/pages.json, safely. The agent writes each page it
// read as one JSON file in data/daily-pages/ (a pages.json section, as in lib/pages-file.js), then
// runs this script. For every page on config.dailyPages the new section is used only when it passes
// the checks below; otherwise the page's previous section stays as it was, old readAt included. The
// new file is written beside the old one, checked with the loader and moved into place in one step,
// so the 10-minute collection never reads half a file. One line per run goes to data/daily-pages.log.
//
// Checks, each from a problem seen in testing:
// - readAt within the last 3 hours (a file left over from another day is not used);
// - at least one item, unless "noData": true (Explore can say there is not enough data);
// - "shown", if given (the filter or keyword the page showed), matches the page's industry,
//   category or keyword: a click had picked the wrong TikTok industry;
// - "total", if given (the row count the page showed), equals the number of items: a partial read;
// - Trending Now by category has at most 100 rows: in a narrow window Google served a mobile layout
//   whose table held the unfiltered list of hundreds;
// - TikTok with 3 rows or fewer, when the last saved list had more, means the login expired;
// - "checksum", if given, equals rowsChecksum(items) computed in the browser: a row mistyped on the
//   way from the page to the file fails it.
//
// Usage: node scripts/save-pages.js
// Exit: 0 every page refreshed; 3 some pages kept from before (see the output); 1 nothing written.

const fs = require('fs');
const path = require('path');

const { getDataDir } = require('./lib/snapshot-store');
const { DEFAULT_MAX_AGE_HOURS, loadPages, pagesFilePath } = require('./lib/pages-file');

const MAX_AGE_MS = 3 * 3600000;
const MAX_CATEGORY_ROWS = 100;
const HELPER_FIELDS = ['shown', 'total', 'checksum', 'noData', 'loggedIn'];

// djb2 over the ranks and titles; the same function runs in the browser before the file is written.
function rowsChecksum(items) {
  const text = JSON.stringify((items || []).map(item => [Number(item.rank), String(item.title)]));
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash;
}

function same(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function viewOf(section) {
  return section.source === 'google-trends' ? (section.view || 'trending') : '';
}

function pageMatches(page, section) {
  return section && section.source === page.source &&
    viewOf(section) === viewOf(page) &&
    ['industry', 'category', 'keyword'].every(key => !page[key] || same(section[key], page[key]));
}

function pageName(page) {
  if (page.industry) return `TikTok: ${page.industry}`;
  if (page.category) return `Google Trending Now: ${page.category}`;
  if (page.keyword) return `Google Explore: ${page.keyword}`;
  return page.source;
}

// Why a staged section cannot be used, or null when it can.
function problemWith(page, section, previous, now) {
  const readAt = Date.parse(section.readAt || '');
  if (!Number.isFinite(readAt)) return 'no valid readAt time';
  if (now - readAt > MAX_AGE_MS) return `read ${Math.round((now - readAt) / 3600000)} hours ago, more than 3`;
  if (readAt - now > 10 * 60000) return 'readAt is in the future';
  const items = Array.isArray(section.items) ? section.items : [];
  if (!items.length && section.noData !== true) return 'no rows (if the page said there is not enough data, set "noData": true)';
  if (items.some(item => !item || !String(item.title || '').trim())) return 'a row has no title';
  const wanted = page.industry || page.category || page.keyword;
  if (section.shown && wanted && !String(section.shown).toLowerCase().includes(String(wanted).toLowerCase())) {
    return `the page showed "${section.shown}", not "${wanted}"`;
  }
  if (section.total !== undefined && Number(section.total) !== items.length) {
    return `${items.length} rows saved but the page showed ${section.total}`;
  }
  if (page.source === 'google-trends' && viewOf(page) === 'trending' && page.category &&
      Math.max(items.length, Number(section.total) || 0) > MAX_CATEGORY_ROWS) {
    return `${Math.max(items.length, Number(section.total) || 0)} rows: this looks like the unfiltered list; widen the window to at least 1280 px and wait for the category`;
  }
  const previousAgeMs = now - Date.parse(previous?.readAt || 0);
  if (page.source === 'tiktok-creative-center' && items.length <= 3 && (previous?.items?.length || 0) > 3 &&
      previousAgeMs < DEFAULT_MAX_AGE_HOURS * 3600000) {
    return `only ${items.length} rows, against ${previous.items.length} last time: the TikTok login may have expired`;
  }
  if (section.checksum !== undefined && Number(section.checksum) !== rowsChecksum(items)) {
    return 'the checksum does not match the rows: a row changed between the page and the file';
  }
  return null;
}

function readStaged(stagingDir) {
  if (!fs.existsSync(stagingDir)) return [];
  return fs.readdirSync(stagingDir)
    .filter(name => name.endsWith('.json'))
    .flatMap(name => {
      const file = path.join(stagingDir, name);
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const sections = Array.isArray(data) ? data : [data];
        const mtime = fs.statSync(file).mtime.toISOString();
        return sections.map(section => ({ file, section: { readAt: mtime, ...section } }));
      } catch (error) {
        return [{ file, error: `not valid JSON: ${error.message}` }];
      }
    });
}

function localIso(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function savePages({ dataDir = getDataDir(), configFile = process.env.SIBYL_CONFIG || '', now = Date.now() } = {}) {
  const config = JSON.parse(fs.readFileSync(configFile || path.join(dataDir, 'config.json'), 'utf8'));
  const dailyPages = (Array.isArray(config.dailyPages) ? config.dailyPages : []).filter(page => page?.source);
  if (!dailyPages.length) throw new Error('config.dailyPages is empty: there are no pages to save');
  const pagesFile = pagesFilePath(config, dataDir);
  let previous = [];
  if (fs.existsSync(pagesFile)) {
    const data = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
    previous = Array.isArray(data) ? data : (Array.isArray(data?.pages) ? data.pages : []);
  }

  const stagingDir = path.join(dataDir, 'daily-pages');
  const staged = readStaged(stagingDir);
  const results = [];
  let sections = previous.filter(section => !dailyPages.some(page => pageMatches(page, section)));
  dailyPages.forEach(page => {
    const old = previous.find(section => pageMatches(page, section));
    const candidates = staged.filter(entry => entry.section && pageMatches(page, entry.section));
    let saved = null;
    let reason = candidates.length ? null : 'not read today';
    candidates.forEach(entry => {
      if (saved) return;
      reason = problemWith(page, entry.section, old, now);
      if (!reason) saved = entry;
    });
    if (saved) {
      const section = { ...saved.section, topic: page.topic || saved.section.topic };
      HELPER_FIELDS.forEach(field => delete section[field]);
      if (!section.topic) delete section.topic;
      sections.push(section);
      results.push({ page: pageName(page), ok: true, rows: section.items.length });
    } else {
      if (old) sections.push(old);
      results.push({ page: pageName(page), ok: false, reason, kept: Boolean(old) });
    }
  });
  staged.filter(entry => entry.error).forEach(entry => results.push({ page: path.basename(entry.file), ok: false, reason: entry.error }));
  staged.filter(entry => entry.section && !dailyPages.some(page => pageMatches(page, entry.section)))
    .forEach(entry => results.push({ page: path.basename(entry.file), ok: false, reason: 'matches no page on the reading list (config.dailyPages)' }));

  // Write beside the old file, check it with the loader, then move it into place in one step. Only
  // problems the old file did not already have stop the write.
  const temp = `${pagesFile}.new`;
  fs.writeFileSync(temp, `${JSON.stringify({ pages: sections }, null, 2)}\n`);
  const loose = { ...config, pagesMaxAgeHours: 100000 };
  const before = fs.existsSync(pagesFile) ? loadPages(loose, dataDir, now).problems : [];
  const fresh = loadPages({ ...loose, pagesFile: temp }, dataDir, now).problems.filter(problem => !before.includes(problem));
  if (fresh.length) {
    fs.rmSync(temp, { force: true });
    throw new Error(`the new pages file failed its check: ${fresh.join('; ')}`);
  }
  fs.renameSync(temp, pagesFile);
  staged.forEach(entry => fs.rmSync(entry.file, { force: true }));

  const refreshed = results.filter(result => result.ok).length;
  const line = [`${localIso(new Date(now))} | REFRESHED ${refreshed} of ${dailyPages.length} pages`,
    ...results.map(result => (result.ok
      ? `${result.page}: OK ${result.rows} rows`
      : `${result.page}: ${result.kept ? 'KEPT the last saved list' : 'NOT SAVED'} (${result.reason})`))].join(' | ');
  fs.appendFileSync(path.join(dataDir, 'daily-pages.log'), `${line}\n`);
  return { refreshed, total: dailyPages.length, results, file: pagesFile };
}

function main() {
  let outcome;
  try {
    outcome = savePages();
  } catch (error) {
    console.log(`Nothing was written: ${error.message}`);
    process.exit(1);
  }
  console.log(`Saved ${outcome.file}: ${outcome.refreshed} of ${outcome.total} pages refreshed.`);
  outcome.results.forEach(result => console.log(result.ok
    ? `- [OK] ${result.page}: ${result.rows} rows`
    : `- [KEPT] ${result.page}: ${result.reason}${result.kept ? '; the last saved list stays in use' : ''}`));
  process.exit(outcome.refreshed === outcome.total ? 0 : 3);
}

if (require.main === module) main();

module.exports = { rowsChecksum, savePages };
