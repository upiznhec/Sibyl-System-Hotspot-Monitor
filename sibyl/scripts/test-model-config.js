#!/usr/bin/env node

// Model settings: where the key, model and endpoint come from, the request path, and that the
// configured model reaches the summarizer. Uses a local HTTP server; nothing leaves the machine.

const assert = require('assert');
const http = require('http');

const {
  chatCompletionsPath,
  readModelSettings,
  resolveModelConfig
} = require('./lib/model-config');
const { callAIModel } = require('../../elixir-summarizer/scripts/elixir-summarizer');
const { buildEventSummary } = require('./lib/event-summary');

const ENV_KEYS = ['SIBYL_AI_API_KEY', 'SIBYL_AI_BASE_URL', 'SIBYL_AI_MODEL'];
ENV_KEYS.forEach(key => delete process.env[key]);

function checkResolution() {
  // AI stays off without both a key and a model.
  assert.strictEqual(resolveModelConfig({}), null);
  assert.strictEqual(resolveModelConfig({ ai: { apiKey: 'test-key' } }), null);
  assert.strictEqual(resolveModelConfig({ ai: { model: 'test-model' } }), null);

  assert.deepStrictEqual(resolveModelConfig({ ai: { apiKey: 'test-key', model: 'test-model' } }), {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    models: [{ id: 'test-model' }]
  });
  // The v1.3.20 provider format still works.
  assert.deepStrictEqual(resolveModelConfig({
    ai: { apiKey: 'test-key', baseUrl: 'https://provider.example.test/v1', models: [{ id: 'old-format' }] }
  }), {
    baseUrl: 'https://provider.example.test/v1',
    apiKey: 'test-key',
    models: [{ id: 'old-format' }]
  });

  // Environment variables win over config.ai.
  process.env.SIBYL_AI_API_KEY = 'env-key';
  process.env.SIBYL_AI_MODEL = 'env-model';
  process.env.SIBYL_AI_BASE_URL = 'https://env.example.test/v1';
  const config = { ai: { apiKey: 'test-key', model: 'test-model', baseUrl: 'https://config.example.test/v1' } };
  assert.deepStrictEqual(resolveModelConfig(config), {
    baseUrl: 'https://env.example.test/v1',
    apiKey: 'env-key',
    models: [{ id: 'env-model' }]
  });
  assert.strictEqual(readModelSettings(config).keyFrom, 'SIBYL_AI_API_KEY');
  ENV_KEYS.forEach(key => delete process.env[key]);
  assert.strictEqual(readModelSettings(config).keyFrom, 'config.ai.apiKey');
  assert.strictEqual(readModelSettings({}).keyFrom, '');
}

function checkPaths() {
  // v1.3.20 posted to /v1/chat/completions; that stays the result for base URLs without a path.
  assert.strictEqual(chatCompletionsPath('https://api.openai.com/v1'), '/v1/chat/completions');
  assert.strictEqual(chatCompletionsPath('https://provider.example.test'), '/v1/chat/completions');
  assert.strictEqual(chatCompletionsPath('https://provider.example.test/compatible-mode/v1/'), '/compatible-mode/v1/chat/completions');
  assert.strictEqual(chatCompletionsPath('https://provider.example.test/v1/chat/completions'), '/v1/chat/completions');
}

function startServer() {
  return new Promise(resolve => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        received.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'test reply' } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port }));
  });
}

async function checkRequest() {
  const { server, received, port } = await startServer();
  const modelConfig = resolveModelConfig({
    ai: { apiKey: 'test-key', model: 'test-model', baseUrl: `http://127.0.0.1:${port}/proxy/v1` }
  });
  const result = await callAIModel('hello', modelConfig, 1);
  server.close();
  assert.deepStrictEqual(result, { success: true, content: 'test reply' });
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].path, '/proxy/v1/chat/completions');
  assert.strictEqual(received[0].auth, 'Bearer test-key');
  assert.strictEqual(received[0].body.model, 'test-model');
  assert.deepStrictEqual(received[0].body.messages, [{ role: 'user', content: 'hello' }]);
}

async function checkSummaryUsesConfiguredModel() {
  const modelConfig = resolveModelConfig({ ai: { apiKey: 'test-key', model: 'test-model' } });
  const cluster = {
    topicId: 'topic-1',
    canonicalTitle: 'Test event',
    mainSignal: { title: 'Test event', platform: 'google-trends' },
    aliases: ['Test event'],
    signals: [{ platform: 'google-trends', platformLabel: 'Google Trends', title: 'Test event' }],
    eventMerge: {
      memberCount: 2,
      memberSummaries: [
        { topicId: 'a', summary: 'First summary.' },
        { topicId: 'b', summary: 'Second summary.' }
      ]
    }
  };
  const context = {
    options: { cacheTtlHours: 6, failureCacheTtlMinutes: 30, retrievalLimit: 10 },
    cache: {},
    failureCache: {},
    alertSummaries: new Map(),
    modelConfig,
    retrieveEvidence: null,
    retrievalCount: 0,
    deadlineAt: Date.now() + 60000
  };
  let seenConfig = null;
  const result = await buildEventSummary(cluster, {}, context, {
    summarize: async (content, title, config) => {
      seenConfig = config;
      return { summary: 'Merged summary.' };
    }
  });
  assert.deepStrictEqual(seenConfig, modelConfig);
  assert.strictEqual(result.summary, 'Merged summary.');
}

async function main() {
  checkResolution();
  checkPaths();
  await checkRequest();
  await checkSummaryUsesConfiguredModel();
  console.log('model config tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
