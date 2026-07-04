# 翻译功能 — 设计文档

**日期**: 2026-07-04
**项目**: Markpad
**分支**: 待定

## 概述

为 Markpad 添加全文翻译功能。用户点击标题栏工具栏中的「翻译」按钮，当前标签页内容被翻译并展示在独立分屏视图中（原文左、译文右）。支持两个翻译引擎：Google 翻译（免费，无需 Key）和 OpenAI 兼容 API（需配置）。

## 需求回顾

| 决策 | 结论 |
|------|------|
| 触发方式 | 标题栏工具栏 [翻译] 按钮，全文翻译当前标签页 |
| 展示方式 | 独立分屏：原文（只读 Monaco）| 译文（只读），底栏操作按钮 |
| 语言选择 | 自动检测源语言 + 设置中预设默认目标语言 |
| 引擎选择 | 设置中指定默认引擎，一键翻译，不显示下拉菜单 |
| 翻译引擎 | Google（免费）、OpenAI 兼容 API（`api.apiyi.com`） |
| API 配置 | 在设置页面中配置 API 端点、Key、模型名称 |
| 技术方案 | 纯前端调用，SvelteKit 端直接发 HTTP 请求 |

## 架构

```
src/lib/translation/
  types.ts                  # Translator 接口定义
  engines/
    google.ts               # Google 翻译（免费非官方端点）
    openai.ts               # OpenAI 兼容 API 翻译
  registry.ts               # 引擎注册表 + 工厂函数
  TranslationService.ts     # 单例：状态管理 + 编排
src/lib/components/
  TranslateView.svelte      # 独立分屏视图
```

### 数据流

```
用户点击[翻译] → TitleBar 触发 action
  → MarkdownViewer 调用 translationService.translate(tab.rawContent)
    → TranslationService 获取 settings.defaultEngine
      → registry.getTranslator(id).translate(text, targetLang, apiKey)
        → 返回译文 → 更新 translatedText
          → TranslateView 渲染 原文(左) | 译文(右)
```

### 与现有系统的关系

- TranslationService 是单例，与 `tabManager`、`settings` 同模式
- TranslateView 与现有的 Editor | Preview 分屏**互斥**：进入翻译分屏时，编辑器/预览被隐藏
- 翻译结果不在 tab 间持久化（每次点击重新请求）
- 工具栏集成使用现有的 titlebarToolbar 系统

## 接口设计

### Translator 接口

```typescript
interface Translator {
  id: string;           // 'google' | 'openai'
  name: string;         // 显示名称
  needsApiKey: boolean; // 是否需要 API Key
  translate(text: string, targetLang: string, apiKey: string): Promise<string>;
}
```

### 引擎详情

| 引擎 | API | needsApiKey | 备注 |
|------|-----|-------------|------|
| Google | `translate.google.com`（免费端点） | false | 零配置可用 |
| OpenAI | `https://api.apiyi.com/v1/chat/completions` | true | 需配置 API Key、模型名 |

## 组件设计

### TranslationService（单例）

状态字段：
- `isTranslating: boolean` — 翻译进行中
- `sourceText: string` — 原文
- `translatedText: string` — 译文
- `error: string | null` — 错误信息
- `showTranslateView: boolean` — 是否显示翻译视图

方法：
- `translate(text: string)` — 获取默认引擎、调用 API、处理结果
- `closeView()` — 关闭视图、清除状态

### TranslateView.svelte

- **左面板**：原文，Monaco 编辑器只读模式，Markdown 语法高亮
- **右面板**：译文，Monaco 编辑器只读模式（纯文本，翻译后结果保持 Markdown 格式）
- **分隔条**：垂直拖拽调整比例，默认 50/50
- **底栏操作**：
  - `← 返回编辑` — 关闭翻译视图
  - `📋 复制译文` — 复制到剪贴板
  - `🔄 重试` — 仅出错时显示，重新翻译

状态覆盖：
- `loading` — 左右面板显示加载动画
- `done` — 显示原文和译文
- `error` — 显示原文 + 错误信息 + 重试按钮

## 设置页面集成

在 Settings.svelte 中新增「翻译」区域：

```
翻译
├── 默认引擎    [下拉: OpenAI / Google]
├── 目标语言    [下拉: 中文简体 / 英文 / 日文 ...]
└── API 配置
    ├── Google     (无需配置)
    └── OpenAI
        ├── API 端点  [输入框]
        ├── API Key   [密码输入框]
        └── 模型      [输入框, 默认: gpt-3.5-turbo]
```

### SettingsStore 新增字段

```typescript
defaultEngine: 'openai' | 'google'  // 默认引擎
targetLanguage: string              // 目标语言
apiKeys: Record<string, string>     // 引擎 → API Key
openaiEndpoint: string              // API 端点
openaiModel: string                 // 模型名称
```

所有字段通过 `$effect` → `localStorage` 持久化。

## 工具栏集成

在 `titlebarToolbar.ts` 中新增 `'translate'` action：
- 加入 `DEFAULT_TITLEBAR_TOOLBAR_ORDER`
- 加入 `DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT` → `'left'`
- 显示位置：导出 HTML / 导出 PDF 之后，与导出同组

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| API Key 未配置 | 在 TranslateView 中提示"请先在设置中配置 API Key" |
| 网络错误 | 显示通用错误信息 + 重试按钮 |
| 引擎返回错误 | 显示引擎返回的具体错误信息 + 重试按钮 |
| 翻译超时 | 30 秒超时，显示超时提示 + 重试按钮 |
| 空文档 | 点击翻译时提示"文档为空，无需翻译" |

## 支持的目标语言

目标语言下拉列表，使用 ISO 639-1 代码映射：

| 显示名 | 代码 | 显示名 | 代码 |
|--------|------|--------|------|
| 中文简体 | zh-CN | 中文繁体 | zh-TW |
| 英文 | en | 日文 | ja |
| 韩文 | ko | 法文 | fr |
| 德文 | de | 西班牙文 | es |
| 葡萄牙文 | pt | 俄文 | ru |
| 意大利文 | it | 荷兰文 | nl |
| 波兰文 | pl | 瑞典文 | sv |
| 越南文 | vi | 土耳其文 | tr |
| 阿拉伯文 | ar | 泰文 | th |
| 印尼文 | id | 希腊文 | el |

## OpenAI 翻译 Prompt

调用 OpenAI 兼容 API 时，使用 system prompt 控制翻译行为：

```
You are a professional translator. Translate the following Markdown text
into {target_language}. Preserve all Markdown formatting, code blocks,
links, and frontmatter exactly as-is. Only translate the natural language
text. Do not add any explanations or extra output.
```

## 涉及文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/lib/translation/types.ts` | Translator 接口 |
| 新建 | `src/lib/translation/engines/google.ts` | Google 翻译引擎 |
| 新建 | `src/lib/translation/engines/openai.ts` | OpenAI 兼容引擎 |
| 新建 | `src/lib/translation/registry.ts` | 引擎注册表 |
| 新建 | `src/lib/translation/TranslationService.ts` | 单例服务 |
| 新建 | `src/lib/components/TranslateView.svelte` | 翻译分屏组件 |
| 修改 | `src/lib/stores/settings.svelte.ts` | 新增翻译设置字段 |
| 修改 | `src/lib/utils/titlebarToolbar.ts` | 新增 translate action |
| 修改 | `src/lib/MarkdownViewer.svelte` | 集成 TranslateView + 绑定 action |
| 修改 | `src/lib/components/Settings.svelte` | 新增翻译设置 UI |
| 修改 | `src/styles.css` | 翻译视图样式 |
| 修改 | `src/lib/utils/i18n.ts` | 翻译相关国际化文本 |
