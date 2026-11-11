// Lists that only a browser can read (TikTok Creative Center, Google Trends category pages) are
// read by the user's agent once a day and saved as pages.json in the data folder. This file
// reads them for the adapters. Format, one section per page read:
//
// { "pages": [ { "source": "tiktok-creative-center", "region": "US",
//                "industry": "Beauty & Personal Care", "period": "7 days",
//                "readAt": "2026-11-10T09:00:00-08:00", "url": "https://…",
//                "items": [ { "rank": 1, "title": "#sunscreen", "posts": 4100, "views": 85000000 } ] } ] }
//
// A bare array of sections also works. When the agent has not read the pages again, the last
// file is used and its age is logged; sections older than maxAgeHours are skipped.

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_AGE_HOURS = 168;
const MAX_ITEMS_PER_SECTION = 200;

function pagesFilePath(config = {}, dataDir) {
  if (config.pagesFile) return path.resolve(dataDir, config.pagesFile);
  return path.join(dataDir, 'pages.json');
}

function cleanItem(item, index) {
  if (!item || typeof item !== 'object') return null;
  const title = String(item.title || '').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 200) return null;
  const rank = Number(item.rank);
  return { ...item, title, rank: Number.isInteger(rank) && rank > 0 ? rank : index + 1 };
}

function cleanSection(section) {
  if (!section || typeof section !== 'object' || !section.source) return null;
  const readAt = Date.parse(section.readAt || '');
  return {
    ...section,
    source: String(section.source),
    readAt: Number.isFinite(readAt) ? new Date(readAt).toISOString() : null,
    items: (Array.isArray(section.items) ? section.items : [])
      .slice(0, MAX_ITEMS_PER_SECTION)
      .map(cleanItem)
      .filter(Boolean)
  };
}

// { file, sections, problems } — sections are checked; problems explain anything skipped.
function loadPages(config = {}, dataDir, now = Date.now()) {
  const file = pagesFilePath(config, dataDir);
  const result = { file, sections: [], problems: [] };
  if (!fs.existsSync(file)) {
    result.problems.push(`no pages file at ${file}`);
    return result;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    result.problems.push(`pages file is not valid JSON: ${error.message}`);
    return result;
  }
  const maxAgeHours = Number(config.pagesMaxAgeHours) || DEFAULT_MAX_AGE_HOURS;
  const sections = Array.isArray(data) ? data : (Array.isArray(data?.pages) ? data.pages : []);
  sections.map(cleanSection).forEach((section, index) => {
    if (!section) {
      result.problems.push(`section ${index + 1} has no "source"`);
      return;
    }
    if (!section.readAt) {
      result.problems.push(`${section.source}: no valid "readAt" time`);
      return;
    }
    const ageHours = (now - Date.parse(section.readAt)) / 3600000;
    if (ageHours > maxAgeHours) {
      result.problems.push(`${section.source}: read ${Math.round(ageHours)} hours ago, older than ${maxAgeHours}`);
      return;
    }
    result.sections.push({ ...section, ageHours: Math.max(0, Number(ageHours.toFixed(1))) });
  });
  return result;
}

function sectionsFor(pages, sourceId) {
  return (pages?.sections || []).filter(section => section.source === sourceId);
}

module.exports = {
  DEFAULT_MAX_AGE_HOURS,
  loadPages,
  pagesFilePath,
  sectionsFor
};
