#!/usr/bin/env node

// The person's contact in http.userAgent goes to Wikimedia only; every other site gets the plain name.

const assert = require('assert');
const http = require('http');

const { DEFAULT_USER_AGENT, configureHttp, isWikimediaHost, requestText, userAgentFor } = require('./lib/http');

const CONTACT = 'SibylHotspotMonitor (person@example.com)';

assert.ok(isWikimediaHost('wikimedia.org'));
assert.ok(isWikimediaHost('en.wikipedia.org'));
assert.ok(isWikimediaHost('WIKIMEDIA.ORG.'));
assert.ok(!isWikimediaHost('evilwikimedia.org'));
assert.ok(!isWikimediaHost('wikimedia.org.example.com'));
assert.ok(!isWikimediaHost('trends.google.com'));

delete process.env.SIBYL_USER_AGENT;
configureHttp({});
assert.strictEqual(userAgentFor('https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country/US/all-access/2026/11/14'),
  DEFAULT_USER_AGENT, 'without a contact, Wikimedia gets the plain name too');

configureHttp({ userAgent: CONTACT });
assert.strictEqual(userAgentFor('https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country/US/all-access/2026/11/14'), CONTACT);
assert.strictEqual(userAgentFor('https://en.wikipedia.org/wiki/Sunscreen'), CONTACT);
for (const url of [
  'https://trends.google.com/trending/rss?geo=US',
  'https://www.googleapis.com/youtube/v3/search?q=sunscreen',
  'https://api.x.com/2/trends/by/woeid/23424977',
  'https://hooks.slack.com/services/T000/B000/XXXX',
  'https://api.telegram.org/bot000:XXXX/sendMessage',
  'not a web address'
]) {
  assert.strictEqual(userAgentFor(url), DEFAULT_USER_AGENT, `no contact for ${url}`);
}

process.env.SIBYL_USER_AGENT = 'SibylHotspotMonitor (https://example.com)';
configureHttp({ userAgent: CONTACT });
assert.strictEqual(userAgentFor('https://wikimedia.org/x'), 'SibylHotspotMonitor (https://example.com)', 'the environment wins');
delete process.env.SIBYL_USER_AGENT;

async function main() {
  // A real request to a site that is not Wikimedia carries no contact.
  configureHttp({ userAgent: CONTACT });
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers['user-agent']);
    res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    assert.strictEqual(await requestText(`http://127.0.0.1:${port}/`, { retries: 0 }), 'ok');
    assert.deepStrictEqual(seen, [DEFAULT_USER_AGENT], 'a request to another site carries no contact');
  } finally {
    server.close();
  }
  console.log('http user agent tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
