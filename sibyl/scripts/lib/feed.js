// Small RSS 2.0 / Atom reader for the feed-based sources (Google Trends RSS, YouTube channel
// feeds, website feeds). It reads only what the adapters need: no dependencies.

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

function decodeEntities(text = '') {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function escapeTag(tag) {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Inner XML of every <tag>…</tag> in xml (tag may have a namespace prefix, e.g. "ht:news_item").
function blocks(xml, tag) {
  const pattern = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`, 'gi');
  const found = [];
  let match;
  while ((match = pattern.exec(xml))) found.push(match[1]);
  return found;
}

// Text of the first <tag>, with CDATA unwrapped, tags removed and entities decoded.
function tagText(xml, tag) {
  const inner = blocks(xml, tag)[0];
  if (inner === undefined) return '';
  const unwrapped = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Value of an attribute on the first matching self-closing or opening tag.
function tagAttribute(xml, tag, attribute) {
  const pattern = new RegExp(`<${escapeTag(tag)}\\b[^>]*\\b${escapeTag(attribute)}=["']([^"']*)["']`, 'i');
  const match = xml.match(pattern);
  return match ? decodeEntities(match[1]) : '';
}

function atomLink(entry) {
  const alternate = entry.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i)?.[0] ||
    entry.match(/<link\b[^>]*>/i)?.[0] || '';
  return decodeEntities(alternate.match(/href=["']([^"']*)["']/i)?.[1] || '');
}

function parseDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

// { title, items: [{ title, link, published, summary, source, xml }] } for RSS or Atom.
// "xml" is the raw item, for adapters that read extra tags.
function parseFeed(xml = '') {
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml) && !/<rss\b/i.test(xml);
  if (isAtom) {
    const head = xml.split(/<entry\b/i)[0];
    return {
      title: tagText(head, 'title'),
      items: blocks(xml, 'entry').map(entry => ({
        title: tagText(entry, 'title'),
        link: atomLink(entry),
        published: parseDate(tagText(entry, 'published') || tagText(entry, 'updated')),
        summary: tagText(entry, 'summary') || tagText(entry, 'media:description'),
        source: tagText(entry, 'name'),
        xml: entry
      }))
    };
  }
  const channel = blocks(xml, 'channel')[0] || xml;
  const head = channel.split(/<item\b/i)[0];
  return {
    title: tagText(head, 'title'),
    items: blocks(channel, 'item').map(item => ({
      title: tagText(item, 'title'),
      link: tagText(item, 'link'),
      published: parseDate(tagText(item, 'pubDate') || tagText(item, 'dc:date')),
      summary: tagText(item, 'description'),
      source: tagText(item, 'source'),
      xml: item
    }))
  };
}

module.exports = {
  blocks,
  decodeEntities,
  parseFeed,
  tagAttribute,
  tagText
};
