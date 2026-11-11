/**
 * Elixir 摘要生成模块 v3.7.0
 * 提供统一的 AI 语义分析摘要生成能力
 * 
 * v3.4 更新：新增商业广告过滤功能
 * - 在生成摘要前检测是否为商业推广内容
 * - 支持游戏/电竞/体育/AI相关内容判断
 * - 过滤手机发布会、汽车广告、纯电商广告等
 *
 * 版本历史:
 * v3.1 - 时间优先级优化版：优先提取最新时间点，忽略历史背景信息
 * v3.2 - 模块化重构版：提取为独立共用模块，支持多监控脚本复用
 *        - 微博监控、抖音监控共用一套摘要逻辑
 *        - 统一入口 summarizeContent(text, title, config)
 *        - 职责分离：获取数据 vs 生成摘要
 * v3.3 - 修复摘要生成逻辑：确保微博监控正确调用 Elixir 生成 AI 摘要
 *        - 修复 getTopicSummary 只返回原始内容的问题
 *        - 添加原始内容 → AI 摘要的转换流程
 *        - 清理 history.json 中过长的原始内容记录
 * v3.4 - 新增商业广告检测功能
 *        - 在摘要生成前检测内容类型
 *        - 过滤非游戏/电竞/体育/AI的商业推广
 *        - 返回结构改为 { summary, isCommercial, category, reason }
 * v3.5 - 支持微博智搜或Agent Reach多来源核验材料
 *        - 只使用来源直接支持的事实，冲突信息不进入摘要
 *        - 摘要聚焦事件与升温原因，不输出市场建议
 * v3.6 - 支持事件线摘要与可配置模型输出长度
 *        - 为综合播报事件合并和摘要生成提供统一模型接口
 * v3.6.1 - 修复模型请求参数与摘要选项重名导致的运行错误
 * v3.7.0 - 将AI行业内容纳入目标范围，扩展摘要和商业过滤判断
 */

const https = require('https');
const http = require('http');
const {
  chatCompletionsPath,
  resolveModelConfig
} = require('../../sibyl/scripts/lib/model-config');

// AI生成摘要提示词模板 - v3.5 多来源核验版
const AI_SUMMARY_PROMPT = `请根据以下已核验热点材料，生成一个简洁流畅的摘要。材料可能来自微博智搜，也可能来自Agent Reach检索的多个公开来源。

【字数要求】
- 目标字数：60-100字（含标点）
- 绝对上限：120字
- 用1-2个流畅短句说完，避免堆砌

分析要求：
1. 提取最新时间点的关键事件（今天/昨日/最新）
2. 判断内容类型：比赛结果 / 游戏更新 / 选手动态 / AI模型与产品动态 / 争议事件 / 其他
3. 提取关键要素：
   - 时间（用"今日"/"昨日"等自然表达）
   - 主体（游戏名/赛事名/机构名/模型名/人名）
   - 核心事件（更新/发布/比赛/争议/动态）
   - 关键亮点（新内容/结果/用户或行业反应）
4. 只使用材料中由来源直接支持的事实；不同来源存在冲突时，删除冲突细节
5. 来源名称、链接和检索过程不写进摘要
6. 说明事件为何形成热点，但不输出市场工作建议或内容承接建议

输出要求：
- 用流畅短句，避免堆砌名词（如"更新新增"→"更新带来"）
- 根据内容自然表达，不要固定套路：
  * 争议事件可用：遭质疑 / 引讨论 / 看法不一 / 争议不断
  * 新内容上线可用：正式上线 / 开放体验 / 玩家期待 / 备受关注
  * 比赛结果可用：结果出炉 / 战况激烈 / 成功晋级 / 遗憾落败
  * 游戏更新可用：获好评 / 反馈积极 / 体验优化 / 内容扩充
  * ❌ 避免每个都用"引热议""引发讨论""反响热烈"
- 保留具体信息（如"送XX礼物""新角色XX"而非笼统"有活动"）
- 使用自然连接词（如"同时""此外""据悉"）
- 每个摘要用不同表达，避免千篇一律

优化示例：
❌ 差："2026年5月29日，恋与深空更新新增男主互动剧情，玩家社区反响热烈，同时推出限时登录活动。"
✅ 好："恋与深空今日更新，新增男主亲密互动剧情引玩家热议，同步上线限时登录送专属礼物活动。"

已核验材料：
{content}

请直接输出摘要，不要解释，不要加引号。`;

// AI重新整理超长摘要的提示词
const AI_TRUNCATE_PROMPT = `请对以下摘要进行大幅精简。

【强制字数要求】
- 当前字数：{currentLength}字
- 目标字数：80-100字
- 绝对上限：120字
- 必须删减至少：{needCut}字

【删减优先级】
1. 删除所有时间细节（保留主要日期即可）
2. 删除具体数值细节（如"90抽"改为"有抽卡保底"）
3. 删除列举项（如"滑翔翼涂装、载具皮肤等奖励"改为"等奖励"）
4. 删除修饰性词语（如"精美的""有趣的"）
5. 删除背景说明和未来计划

【必须保留】
- 核心时间（几月几日）
- 主体（游戏/赛事/人物）
- 核心事件（更新/比赛/动态）
- 最关键的结果/数据

【示例】
原文：2026年5月28日，《异环》1.1版本更新，新角色安魂曲上线，为暗属性主C，有限定棋盘开放至6月18日，90抽保底可获皮肤奖励，还有付费时装和免费时装上架，兑换码当日有效。
精简：5月28日《异环》1.1版本更新，新角色安魂曲（暗属性主C）上线，开放限定棋盘及抽卡活动，上架多款时装，公布限时兑换码。

原文摘要：
{content}

请输出精简后的摘要，严格控制在80-100字。直接输出，不要解释。`;

// 商业广告检测提示词模板 - v3.4 新增
const COMMERCIAL_DETECTION_PROMPT = `请分析以下热点话题的已核验材料，判断是否为商业推广或非目标内容。

话题标题：{title}
话题内容：
{content}

判断类别：
1. 游戏内容本身 - 游戏更新、新皮肤/英雄上线、版本改动、游戏活动、游戏攻略等
2. 电竞赛事 - 比赛结果、选手表现、战队动态、赛事预告、转会消息等
3. 玩家社区 - 玩家讨论、攻略分享、吐槽、二创内容、社区活动等
4. 跨界联动 - 游戏与其他领域的联动（如主播带货游戏皮肤、明星代言游戏、游戏联名活动等）
5. 体育内容 - 足球、篮球、乒乓球等体育赛事、运动员动态、体育新闻等
6. AI内容 - 人工智能模型、产品、公司、算力芯片、生成式内容、具身智能等动态
7. 商业推广 - 与游戏/电竞/体育/AI无关的产品推广（如普通手机发布会、汽车广告、电商平台纯广告等）
8. 非目标内容 - 虽然包含目标领域相关词汇，但实际内容是其他领域

判断标准：
- 如果话题主体是游戏内容、电竞赛事、玩家社区讨论、体育内容、AI行业动态，或目标领域相关的跨界联动 → 标记为"正常内容"
- 如果话题是纯产品广告，与游戏/电竞/体育/AI内容无关 → 标记为"商业推广"
- 如果话题虽然包含游戏相关词汇（如"荣耀""王者"），但实际内容是手机/汽车等其他产品 → 标记为"非目标内容"

重要提示：
- "荣耀WIN Turbo""荣耀600"等是手机产品，不是王者荣耀游戏内容
- "王者"单独出现可能是指王者荣耀，也可能是泛指第一名，需要结合上下文判断
- "原神""DOTA2""LOL""王者荣耀"等明确游戏词汇 → 正常内容
- "梅西""C罗""NBA""樊振东""孙颖莎"等明确体育词汇 → 正常内容
- "OpenAI""DeepSeek""Claude""大模型""具身智能"等明确AI领域词汇 → 正常内容
- 手机发布会、新车上市、电商平台促销等 → 商业推广

请严格按以下JSON格式返回，不要添加其他内容：
{
  "isCommercial": true/false,
  "category": "正常内容/商业推广/非目标内容",
  "subCategory": "游戏内容/电竞赛事/玩家社区/跨界联动/体育内容/AI内容/手机产品/汽车产品/其他产品",
  "reason": "判断理由（简要说明）",
  "confidence": 0.95
}`;

/**
 * 调用AI模型（带重试机制）
 */
async function callAIModel(prompt, config, maxRetries = 2, options = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await new Promise((resolve) => {
      const data = JSON.stringify({
        model: config.models?.[0]?.id || 'kimi-k2.5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 500,
        temperature: options.temperature ?? 0.3
      });

      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const isHttps = baseUrl.startsWith('https');
      const url = new URL(baseUrl);
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: chatCompletionsPath(baseUrl),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = client.request(requestOptions, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(responseData);
            const content = json.choices?.[0]?.message?.content;
            if (content) {
              resolve({ success: true, content });
            } else {
              resolve({ success: false, error: 'AI返回内容为空' });
            }
          } catch (e) {
            resolve({ success: false, error: '解析失败: ' + e.message });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: '请求错误: ' + e.message });
      });

      req.setTimeout(20000, () => {
        req.destroy();
        resolve({ success: false, error: '请求超时(20s)' });
      });

      req.write(data);
      req.end();
    });

    if (result.success) {
      return result;
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { success: false, error: '最终失败' };
}

/**
 * 检测是否为商业广告或非目标内容 - v3.4 新增
 */
async function detectCommercialContent(content, title, customConfig = null) {
  try {
    const modelConfig = customConfig || resolveModelConfig();

    if (!modelConfig || !modelConfig.apiKey) {
      console.log('⚠️ AI模型未配置，无法检测商业广告');
      return { isCommercial: false, category: '未知', reason: 'AI未配置', confidence: 0 };
    }

    const cleanedContent = content
      .replace(/```wbCustomBlock[\s\S]*?```/g, '')
      .replace(/<media-block>[\s\S]*?<\/media-block>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\*\*/g, '')
      .replace(/#+\s*/g, '')
      .trim()
      .substring(0, 2000);

    const prompt = COMMERCIAL_DETECTION_PROMPT
      .replace('{title}', title || '未知话题')
      .replace('{content}', cleanedContent || '暂无内容');

    console.log(`🔍 检测商业广告: ${title}`);
    const result = await callAIModel(prompt, modelConfig);

    if (result.success) {
      try {
        const msg = result.content;
        const jsonMatch = msg.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const detection = {
            isCommercial: parsed.isCommercial === true || parsed.category === '商业推广' || parsed.category === '非目标内容',
            category: parsed.category || '未知',
            subCategory: parsed.subCategory || null,
            reason: parsed.reason || '未说明',
            confidence: parsed.confidence || 0.5
          };
          
          const icon = detection.isCommercial ? '🚫' : '✅';
          console.log(`  ${icon} 检测结果: ${detection.category}`);
          console.log(`     原因: ${detection.reason}`);
          
          return detection;
        }
      } catch (e) {
        console.error('❌ 解析AI检测结果失败:', e.message);
      }
    }

    console.log('⚠️ AI检测失败，默认不拦截');
    return { isCommercial: false, category: '未知', reason: 'AI解析失败', confidence: 0 };
  } catch (e) {
    console.error('❌ 商业广告检测失败:', e.message);
    return { isCommercial: false, category: '未知', reason: '检测异常', confidence: 0 };
  }
}

/**
 * 使用AI生成摘要
 * 优化：超长时让AI重新整理，兜底方案作为最后防线
 */
async function generateAISummary(content, title = '', customConfig = null, retryCount = 0) {
  const MAX_RETRIES = 1; // 超长时最多重试1次
  
  try {
    const modelConfig = customConfig || resolveModelConfig();

    if (!modelConfig || !modelConfig.apiKey) {
      console.log('⚠️ AI模型未配置，无法生成摘要');
      return null;
    }

    const prompt = AI_SUMMARY_PROMPT.replace('{content}', content);
    const result = await callAIModel(prompt, modelConfig);

    if (!result.success) {
      console.log('❌ AI生成摘要失败:', result.error);
      return null;
    }

    const summary = result.content.replace(/^["']|["']$/g, '').trim();
    const length = summary.length;

    // 检查字数
    if (length >= 20 && length <= 120) {
      // 在目标范围内，直接返回
      console.log(`✅ AI摘要生成成功: ${length}字`);
      return summary;
    }
    
    // 120-150字之间，尝试精简到120字以内
    if (length > 120 && length <= 150 && retryCount < MAX_RETRIES) {
      const needCut = length - 100;
      console.log(`📝 摘要略长(${length}字)，让AI精简到120字以内(需删减${needCut}字)...`);
      const truncatePrompt = AI_TRUNCATE_PROMPT
        .replace('{content}', summary)
        .replace('{currentLength}', length.toString())
        .replace('{needCut}', needCut.toString());
      const truncateResult = await callAIModel(truncatePrompt, modelConfig);
      
      if (truncateResult.success) {
        const truncated = truncateResult.content.replace(/^["']|["']$/g, '').trim();
        const truncatedLen = truncated.length;
        
        if (truncatedLen >= 20 && truncatedLen <= 120) {
          console.log(`✅ AI精简成功: ${truncatedLen}字`);
          return truncated;
        } else if (truncatedLen > 120 && truncatedLen <= 150) {
          console.log(`⚠️ 精简后仍略长(${truncatedLen}字)，但可接受`);
          return truncated;
        } else {
          console.log(`⚠️ 精简后不合规(${truncatedLen}字)，使用原AI输出`);
          return summary; // 返回原AI输出（120-150字之间可接受）
        }
      } else {
        console.log('❌ AI精简失败:', truncateResult.error);
        return summary; // 返回原AI输出
      }
    }

    // 字数超限，尝试让AI重新整理
    if (length > 120 && retryCount < MAX_RETRIES) {
      const needCut = length - 100;
      console.log(`📝 摘要超长(${length}字)，让AI重新精简(需删减${needCut}字)...`);
      const truncatePrompt = AI_TRUNCATE_PROMPT
        .replace('{content}', summary)
        .replace('{currentLength}', length.toString())
        .replace('{needCut}', needCut.toString());
      const truncateResult = await callAIModel(truncatePrompt, modelConfig);
      
      if (truncateResult.success) {
        const truncated = truncateResult.content.replace(/^["']|["']$/g, '').trim();
        const truncatedLen = truncated.length;
        
        if (truncatedLen >= 20 && truncatedLen <= 150) {
          console.log(`✅ AI重新精简成功: ${truncatedLen}字`);
          return truncated;
        } else {
          console.log(`⚠️ 重新精简后仍不合规(${truncatedLen}字)，使用兜底方案`);
        }
      } else {
        console.log('❌ AI重新精简失败:', truncateResult.error);
      }
    }

    // 太短或太长都无法修复，返回null触发兜底
    console.log(`⚠️ AI摘要字数不合规(${length}字)，使用兜底方案`);
    return null;
  } catch (e) {
    console.error('❌ AI生成摘要失败:', e.message);
    return null;
  }
}

/**
 * 清理摘要文本
 */
function cleanSummary(text) {
  if (!text) return '暂无摘要';

  let cleaned = text
    .replace(/```wbCustomBlock[\s\S]*?```/g, '')
    .replace(/<media-block>[\s\S]*?<\/media-block>/g, '');

  cleaned = cleaned.replace(/###\s+/g, '\n');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');

  return cleaned.trim();
}

/**
 * 从原文中提取摘要（兜底方案）
 */
function extractSummaryFromText(text) {
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 20);

  if (paragraphs.length === 0) return '暂无摘要';

  let firstPara = paragraphs[0]
    .replace(/\*\*/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  if (firstPara.length > 150) {
    const truncated = firstPara.substring(0, 150);
    const lastSentence = truncated.lastIndexOf('。');
    if (lastSentence > 100) {
      firstPara = truncated.substring(0, lastSentence + 1);
    } else {
      firstPara = truncated.substring(0, 147) + '...';
    }
  }

  return firstPara;
}

/**
 * 生成摘要（主函数）- v3.4 更新：新增商业广告检测
 * @param {string} text - 原始内容
 * @param {string} title - 话题标题（可选）
 * @param {Object} customConfig - 自定义AI配置（可选）
 * @returns {Promise<Object>} 结果 { summary, isCommercial, category, subCategory, reason, confidence }
 */
async function summarizeContent(text, title = '', customConfig = null) {
  if (!text) {
    return { summary: '暂无摘要', isCommercial: false, category: '未知', reason: '无内容', confidence: 0 };
  }

  // 清理文本
  let cleaned = text
    .replace(/```wbCustomBlock[\s\S]*?```/g, '')
    .replace(/<media-block>[\s\S]*?<\/media-block>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/#+\s*/g, '');

  // 第一步：检测是否为商业广告
  console.log('🔍 第一步：检测内容类型...');
  const detection = await detectCommercialContent(cleaned, title, customConfig);
  
  // 如果是商业广告或非目标内容，直接返回，不生成摘要
  if (detection.isCommercial) {
    console.log(`🚫 已过滤商业广告: ${title}`);
    return {
      summary: null,
      isCommercial: true,
      category: detection.category,
      subCategory: detection.subCategory,
      reason: detection.reason,
      confidence: detection.confidence
    };
  }

  // 第二步：生成摘要
  console.log('🤖 第二步：生成AI摘要...');
  const aiSummary = await generateAISummary(cleaned, title, customConfig);
  
  if (aiSummary) {
    return {
      summary: aiSummary,
      isCommercial: false,
      category: detection.category,
      subCategory: detection.subCategory,
      reason: detection.reason,
      confidence: detection.confidence
    };
  }

  // AI失败时，从原文提取第一段作为兜底
  console.log('⚠️ AI生成失败，从原文提取摘要');
  const fallbackSummary = extractSummaryFromText(cleaned);
  return {
    summary: fallbackSummary,
    isCommercial: false,
    category: detection.category || '正常内容',
    subCategory: detection.subCategory,
    reason: 'AI生成失败，使用原文提取',
    confidence: detection.confidence
  };
}

module.exports = {
  // 主函数
  summarizeContent,
  // AI相关
  generateAISummary,
  callAIModel,
  // 商业广告检测 - v3.4 新增
  detectCommercialContent,
  // 工具函数
  cleanSummary,
  extractSummaryFromText,
  // 常量
  AI_SUMMARY_PROMPT,
  COMMERCIAL_DETECTION_PROMPT
};
