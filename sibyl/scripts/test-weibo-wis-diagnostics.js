#!/usr/bin/env node

const assert = require('assert');

const {
  getWeiboTokenResult,
  searchWeiboAIResult
} = require('./lib/weibo-wis');

async function main() {
  const missing = await getWeiboTokenResult({ alerts: { weiboAI: {} } });
  assert.strictEqual(missing.token, null);
  assert.strictEqual(missing.reason, 'credentials_missing');

  const result = await searchWeiboAIResult('测试话题', 'token', {
    alerts: {
      weiboAI: {
        searchUrl: 'not-a-valid-url'
      }
    }
  });

  assert.strictEqual(result.content, '');
  assert.strictEqual(result.reason, 'search_url_invalid');
  console.log('微博智搜失败诊断测试通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
