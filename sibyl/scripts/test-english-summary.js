#!/usr/bin/env node

// English summaries: the prompts sent to the model, the 50-word rule with one request to
// shorten, the advertising check, and the first-headline fallback without a model.
// A local server stands in for the model; nothing leaves the machine.

const assert = require('assert');
const http = require('http');

['SIBYL_AI_API_KEY', 'SIBYL_AI_BASE_URL', 'SIBYL_AI_MODEL'].forEach(key => delete process.env[key]);
const { configureLocale } = require('./lib/locale');
configureLocale({ language: 'en' });
const { summarizeContent } = require('../../elixir-summarizer/scripts/elixir-summarizer');

const SHORT = 'Brand A recalled its mineral sunscreen stick on Tuesday over a labeling error, and shoppers are searching for refund details.';
const LONG = `${'Brand A recalled its mineral sunscreen stick after a labeling error was found by a regulator, '.repeat(5)}and stores removed it.`;
const SHORTENED = 'Brand A recalled its mineral sunscreen stick over a labeling error.';

function fakeModel(prompts) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const prompt = JSON.parse(body).messages[0].content;
      prompts.push(prompt);
      let content = '';
      if (prompt.startsWith('Decide whether this trending topic is advertising')) {
        content = /^Title: .*coupon/im.test(prompt)
          ? '{"isCommercial": true, "category": "promotion", "reason": "a coupon offer", "confidence": 0.9}'
          : '{"isCommercial": false, "category": "normal", "reason": "a product recall in the news", "confidence": 0.9}';
      } else if (prompt.startsWith('Write a short summary')) {
        content = prompt.includes('LONG MATERIAL') ? LONG : SHORT;
      } else if (prompt.startsWith('Shorten this summary')) {
        content = SHORTENED;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
}

async function main() {
  const prompts = [];
  const server = fakeModel(prompts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const model = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'test-key', models: [{ id: 'test-model' }] };
  const material = 'Brand A recalls mineral sunscreen stick over labeling (Example News)';

  try {
    const normal = await summarizeContent(material, 'mineral sunscreen recall', model);
    assert.strictEqual(normal.isCommercial, false);
    assert.strictEqual(normal.summary, SHORT);
    assert.ok(prompts.some(prompt => prompt.includes('at most two sentences and 50 words')));
    assert.ok(prompts.every(prompt => !/[一-龥]/.test(prompt)), 'prompts are English');

    const long = await summarizeContent(`${material}\nLONG MATERIAL`, 'mineral sunscreen recall', model);
    assert.strictEqual(long.summary, SHORTENED, 'a summary over 50 words is shortened once');

    const ad = await summarizeContent('Brand B coupon: 20% off sunscreen this week only', 'sunscreen coupon', model);
    assert.strictEqual(ad.isCommercial, true);
  } finally {
    server.close();
  }

  // No model: the first line of the material is the summary, as in v1.3.20.
  const fallback = await summarizeContent(`${material}\nSecond headline (Other News)`, 'mineral sunscreen recall', null);
  assert.strictEqual(fallback.summary, material);
  assert.strictEqual((await summarizeContent('', 'x', null)).summary, 'No summary yet');

  console.log('English summary tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
