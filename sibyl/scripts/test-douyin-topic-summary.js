#!/usr/bin/env node

const assert = require('assert');
const {
  buildDouyinHotListEvidence,
  parseDouyinTopicHtml,
  retrieveDouyinTopicEvidence,
  validTopicUrl
} = require('./lib/douyin-topic');

async function main() {
  const fixture = `
    <html>
      <head>
        <meta name="description" content="葡萄牙淘汰克罗地亚晋级，C罗与莫德里奇赛后相拥。">
      </head>
      <body>
        <script type="application/json">
          {
            "items": [
              {"desc":"C罗与莫德里奇是多年好友，赛后两人拥抱致意。"},
              {"desc":"葡萄牙2比1战胜克罗地亚，晋级世界杯16强。"},
              {"desc":"C罗莫德里奇是对手更是挚友"}
            ]
          }
        </script>
      </body>
    </html>
  `;
  const items = parseDouyinTopicHtml(fixture, 'C罗莫德里奇是对手更是挚友');
  assert.strictEqual(items.length, 3);
  assert(validTopicUrl('https://www.douyin.com/hot/2556668/example'));
  assert(!validTopicUrl('https://www.douyin.com/search/example'));

  const result = await retrieveDouyinTopicEvidence({
    title: 'C罗莫德里奇是对手更是挚友',
    url: 'https://www.douyin.com/hot/2556668/example'
  }, { directPageEnabled: true }, {
    requestText: async () => fixture
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.itemCount, 3);
  assert(result.evidenceText.includes('葡萄牙2比1战胜克罗地亚'));

  const hotList = buildDouyinHotListEvidence({
    platform: 'douyin',
    title: 'C罗莫德里奇是对手更是挚友',
    rank: 22,
    heat: 8441000
  }, [
    { platform: 'douyin', title: 'C罗莫德里奇是对手更是挚友', rank: 22, heat: 8441000 },
    { platform: 'douyin', title: 'C罗全场最佳球员', rank: 17, heat: 9072000 },
    { platform: 'douyin', title: 'C罗打破淘汰赛零进球纪录', rank: 25, heat: 7837000 },
    { platform: 'douyin', title: '王楚钦孙颖莎晋级混双决赛', rank: 14, heat: 9191000 }
  ]);
  assert.strictEqual(hotList.success, true);
  assert.strictEqual(hotList.itemCount, 3);
  assert(!hotList.evidenceText.includes('王楚钦'));
  console.log('抖音原生话题摘要取材测试通过');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
