// Output language and time zone for what people read: briefings, alerts and their times.
// Each run sets them once from the config ("language", "timeZone"). The defaults are English
// and the computer's own time zone, which is also the zone that cron uses.

const LANGUAGE_LOADERS = {
  en: () => require('./lang/en'),
  zh: () => require('./lang/zh')
};

const formatters = new Map();
let settings = null;

function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (error) {
    return false;
  }
}

function configureLocale(config = {}) {
  settings = {
    language: LANGUAGE_LOADERS[config.language] ? config.language : 'en',
    timeZone: isValidTimeZone(config.timeZone) ? config.timeZone : systemTimeZone()
  };
  return settings;
}

function current() {
  return settings || configureLocale();
}

// The wording of the configured language (lib/lang/<code>.js).
function text() {
  return LANGUAGE_LOADERS[current().language]();
}

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short'
    }));
  }
  return formatters.get(timeZone);
}

function zonedParts(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = {};
  formatter(current().timeZone).formatToParts(value).forEach(part => {
    parts[part.type] = part.value;
  });
  return parts;
}

// "YYYY-MM-DD" in the configured time zone. Alerts use it as the once-a-day key.
function localDateKey(date = new Date()) {
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// "HH:MM" in the configured time zone.
function localClock(date = new Date()) {
  const parts = zonedParts(date);
  return `${parts.hour}:${parts.minute}`;
}

// "YYYY-MM-DD HH:MM" in the configured time zone.
function localDateTime(date = new Date()) {
  return `${localDateKey(date)} ${localClock(date)}`;
}

// Short name of the zone at that date, such as "PST" or "GMT+8".
function zoneName(date = new Date()) {
  return zonedParts(date).timeZoneName || current().timeZone;
}

// True for the "no summary" placeholder of any language, so old cache entries also count.
function isNoSummary(value) {
  const text = String(value || '').trim();
  return Object.values(LANGUAGE_LOADERS).some(load => load().noSummary === text);
}

module.exports = {
  configureLocale,
  current,
  isNoSummary,
  isValidTimeZone,
  localClock,
  localDateKey,
  localDateTime,
  systemTimeZone,
  text,
  zoneName
};
