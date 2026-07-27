const fs = require('fs');
const http = require('http');
const https = require('https');

const DEFAULT_AUTH_URL = 'https://open-im.api.weibo.com/open/auth/ws_token';
const DEFAULT_SEARCH_URL = 'https://open-im.api.weibo.com/open/wis/search_query';

function readOpenClawConfig() {
  try {
    return JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
  } catch (error) {
    return {};
  }
}

function getWeiboAIConfig(customConfig = {}) {
  const openclawWeibo = readOpenClawConfig().channels?.weibo || {};
  const configured = customConfig.alerts?.weiboAI || customConfig.weiboAI || {};
  return {
    appId: String(process.env.SIBYL_WEIBO_APP_ID || configured.appId || openclawWeibo.appId || ''),
    appSecret: process.env.SIBYL_WEIBO_APP_SECRET || configured.appSecret || openclawWeibo.appSecret || '',
    authUrl: process.env.SIBYL_WEIBO_WIS_AUTH_URL || configured.authUrl || DEFAULT_AUTH_URL,
    searchUrl: process.env.SIBYL_WEIBO_WIS_SEARCH_URL || configured.searchUrl || DEFAULT_SEARCH_URL
  };
}

function requestClient(parsedUrl) {
  return parsedUrl.protocol === 'http:' ? http : https;
}

function getWeiboTokenResult(customConfig = {}) {
  return new Promise(resolve => {
    const { appId, appSecret, authUrl } = getWeiboAIConfig(customConfig);
    if (!appId || !appSecret) return resolve({ token: null, reason: 'credentials_missing' });

    const data = JSON.stringify({ app_id: appId, app_secret: appSecret });
    let parsedUrl;
    try {
      parsedUrl = new URL(authUrl);
    } catch (error) {
      return resolve({ token: null, reason: 'auth_url_invalid' });
    }

    const req = requestClient(parsedUrl).request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          const token = parsed.data?.token || null;
          resolve({
            token,
            reason: token ? null : `auth_rejected:${parsed.code ?? 'unknown'}`
          });
        } catch (error) {
          resolve({ token: null, reason: 'auth_response_invalid' });
        }
      });
    });

    req.on('error', error => resolve({ token: null, reason: `auth_request_error:${error.code || 'unknown'}` }));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ token: null, reason: 'auth_timeout' });
    });
    req.write(data);
    req.end();
  });
}

async function getWeiboToken(customConfig = {}) {
  return (await getWeiboTokenResult(customConfig)).token;
}

function searchWeiboAIResult(query, token, customConfig = {}) {
  return new Promise(resolve => {
    if (!token || !query) return resolve({
      content: '',
      reason: !token ? 'token_missing' : 'query_missing'
    });

    let parsedUrl;
    try {
      parsedUrl = new URL(getWeiboAIConfig(customConfig).searchUrl);
      parsedUrl.searchParams.set('query', query);
      parsedUrl.searchParams.set('token', token);
    } catch (error) {
      return resolve({ content: '', reason: 'search_url_invalid' });
    }

    const req = requestClient(parsedUrl).get(
      parsedUrl,
      { headers: { 'Content-Type': 'application/json' } },
      res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.code === 0 && parsed.data && !parsed.data.noContent
              ? parsed.data.msg || ''
              : '';
            resolve({
              content,
              reason: content
                ? null
                : (parsed.data?.noContent ? 'no_content' : `search_rejected:${parsed.code ?? 'unknown'}`),
              statusCode: res.statusCode
            });
          } catch (error) {
            resolve({ content: '', reason: 'search_response_invalid', statusCode: res.statusCode });
          }
        });
      }
    );
    req.on('error', error => resolve({
      content: '',
      reason: `search_request_error:${error.code || 'unknown'}`
    }));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ content: '', reason: 'search_timeout' });
    });
  });
}

async function searchWeiboAI(query, token, customConfig = {}) {
  return (await searchWeiboAIResult(query, token, customConfig)).content;
}

module.exports = {
  getWeiboAIConfig,
  getWeiboToken,
  getWeiboTokenResult,
  searchWeiboAI,
  searchWeiboAIResult
};
