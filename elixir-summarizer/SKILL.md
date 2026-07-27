---
name: elixir-summarizer
description: Elixir智能摘要生成模块，提供统一的AI语义分析摘要生成能力，支持商业广告检测与过滤，生成60-100字简洁流畅的内容摘要。
version: 3.7.0
author: Misaka Studio
license: MIT
tags:
  - ai
  - summarizer
  - nlp
  - content-analysis
  - commercial-detection
---

# Elixir 智能摘要生成模块

## 功能说明

Elixir是一个统一的AI语义分析摘要生成模块，为微博监控、抖音监控等工具提供智能内容分析能力。输入既可以是微博智搜内容，也可以是Agent Reach整理的多来源核验材料。

### 核心功能

- **商业广告检测**：在生成摘要前检测是否为商业推广内容
- **智能摘要生成**：生成60-100字简洁流畅的摘要
- **内容分类**：自动分类为游戏内容/电竞赛事/玩家社区/跨界联动/体育内容/AI内容/商业推广/非目标内容
- **兜底方案**：AI失败时自动从原文提取摘要
- **多来源核验**：只使用来源直接支持的事实，冲突信息不写入摘要

### 版本历史

- **v3.1**: 时间优先级优化版，优先提取最新时间点，忽略历史背景信息
- **v3.2**: 模块化重构版，提取为独立共用模块，支持多监控脚本复用
- **v3.3**: 修复摘要生成逻辑，确保正确调用AI生成摘要
- **v3.4**: 新增商业广告检测功能，过滤非游戏/电竞/体育/AI的商业推广
- **v3.5**: 支持Agent Reach多来源核验材料，过滤冲突事实与来源链接
- **v3.6**: 支持综合播报事件线摘要和可配置模型输出长度
- **v3.6.1**: 修复模型请求参数与摘要选项重名导致的运行错误
- **v3.7.0**: 将AI行业内容纳入目标范围，支持模型产品、内容生成、算力芯片和具身智能摘要判断

## 使用方式

### 作为模块引入

```javascript
const { summarizeContent, detectCommercialContent } = require('./elixir-summarizer');

// 生成摘要并检测商业广告
const result = await summarizeContent(content, title);

// 结果格式：
// {
//   summary: "生成的摘要文本",
//   isCommercial: false,
//   category: "正常内容",
//   subCategory: "游戏内容",
//   reason: "判断理由",
//   confidence: 0.95
// }
```

### 单独检测商业广告

```javascript
const { detectCommercialContent } = require('./elixir-summarizer');

const detection = await detectCommercialContent(content, title);

// 结果格式：
// {
//   isCommercial: false,
//   category: "正常内容",
//   subCategory: "游戏内容",
//   reason: "判断理由",
//   confidence: 0.95
// }
```

### CLI使用

```bash
# 直接运行查看模块信息
node scripts/elixir-summarizer.js
```

## API参考

### summarizeContent(text, title, customConfig)

生成内容摘要并检测商业广告。

**参数：**
- `text` (string): 原始内容文本
- `title` (string, optional): 话题标题
- `customConfig` (Object, optional): 自定义AI配置

**返回：**
```javascript
{
  summary: string,        // 生成的摘要（商业广告时为null）
  isCommercial: boolean,    // 是否为商业广告
  category: string,       // 主分类
  subCategory: string,      // 子分类
  reason: string,          // 判断理由
  confidence: number        // 置信度
}
```

### detectCommercialContent(content, title, customConfig)

检测内容是否为商业广告或非目标内容。

**参数：**
- `content` (string): 内容文本
- `title` (string): 话题标题
- `customConfig` (Object, optional): 自定义AI配置

**返回：**
```javascript
{
  isCommercial: boolean,
  category: string,
  subCategory: string,
  reason: string,
  confidence: number
}
```

### generateAISummary(content, title, customConfig, retryCount)

使用AI生成摘要（内部方法）。

**参数：**
- `content` (string): 清理后的内容文本
- `title` (string): 话题标题
- `customConfig` (Object): AI配置
- `retryCount` (number): 重试次数

**返回：** string | null

### callAIModel(prompt, config, maxRetries)

调用AI模型（带重试机制）。

**参数：**
- `prompt` (string): 提示词
- `config` (Object): AI配置
- `maxRetries` (number): 最大重试次数，默认2

**返回：**
```javascript
{
  success: boolean,
  content: string,  // success为true时
  error: string     // success为false时
}
```

### cleanSummary(text)

清理摘要文本，移除HTML标签和特殊格式。

### extractSummaryFromText(text)

从原文中提取摘要（兜底方案）。

## 配置说明

### AI模型配置

从 `/root/.openclaw/openclaw.json` 读取：

```json
{
  "models": {
    "providers": {
      "aliyun": {
        "apiKey": "your-api-key",
        "baseUrl": "https://api.example.com/v1",
        "models": [{"id": "kimi-k2.5"}]
      }
    }
  }
}
```

## 摘要生成规则

### 字数要求
- 目标字数：60-100字（含标点）
- 绝对上限：120字
- 用1-2个流畅短句说完，避免堆砌

### 分析要求
1. 提取最新时间点的关键事件（今天/昨日/最新）
2. 判断内容类型：比赛结果/游戏更新/选手动态/争议事件/其他
3. 提取关键要素：
   - 时间（用"今日"/"昨日"等自然表达）
   - 主体（游戏名/赛事名/人名）
   - 核心事件（更新/比赛/争议/动态）
   - 关键亮点（新内容/结果/玩家反应）

### 输出要求
- 用流畅短句，避免堆砌名词
- 根据内容自然表达，不要固定套路
- 保留具体信息
- 使用自然连接词
- 每个摘要用不同表达，避免千篇一律

## 商业广告检测规则

### 正常内容
- 游戏内容本身：游戏更新、新皮肤/英雄上线、版本改动、游戏活动等
- 电竞赛事：比赛结果、选手表现、战队动态、赛事预告等
- 玩家社区：玩家讨论、攻略分享、吐槽、二创内容等
- 跨界联动：游戏与其他领域的联动
- 体育内容：足球、篮球、乒乓球等体育赛事、运动员动态

### 商业推广
- 与游戏/电竞/体育/AI无关的产品推广
- 手机发布会、汽车广告、电商平台纯广告等

### 非目标内容
- 虽然包含游戏相关词汇，但实际内容是其他领域
- 例如："荣耀600"是手机产品而非王者荣耀游戏

## 注意事项

- 需要配置AI模型才能正常使用
- AI生成失败时会自动使用兜底方案
- 商业广告内容不会生成摘要，直接返回isCommercial=true
- 超长摘要会自动精简

## 与其他Skill的关系

- **被依赖**：weibo-monitor、 douyin-monitor
- **共享使用**：keywords-loader（关键词匹配）
