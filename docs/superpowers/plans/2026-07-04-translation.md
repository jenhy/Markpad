# 翻译功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Markpad 添加全文翻译功能，支持 Google 翻译（免费）和 OpenAI 兼容 API（api.apiyi.com）

**Architecture:** 纯前端方案，新增 `src/lib/translation/` 模块（接口 + 引擎 + 注册表 + 单例服务），新组件 `TranslateView.svelte`（独立分屏），修改 Settings/Toolbar/MarkdownViewer 以集成

**Tech Stack:** TypeScript + Svelte 5 runes + Monaco Editor + fetch API

---

### Task 1: 创建翻译引擎接口

**Files:**
- Create: `src/lib/translation/types.ts`

- [ ] **Step 1: 写入接口定义**

```typescript
export interface Translator {
	id: string;
	name: string;
	needsApiKey: boolean;
	translate(text: string, targetLang: string, apiKey: string): Promise<string>;
}
```

- [ ] **Step 2: 创建目录并提交**

```bash
mkdir -p src/lib/translation/engines
git add src/lib/translation/types.ts
git commit -m "feat(translate): add Translator interface"
```

---

### Task 2: 创建 Google 翻译引擎

**Files:**
- Create: `src/lib/translation/engines/google.ts`

- [ ] **Step 1: 写入 Google 翻译引擎**

```typescript
import type { Translator } from '../types.js';

export const googleTranslator: Translator = {
	id: 'google',
	name: 'Google Translate',
	needsApiKey: false,

	async translate(text: string, targetLang: string, _apiKey: string): Promise<string> {
		const sourceLang = 'auto';
		const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);

		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`Google Translate returned ${response.status}`);
			}
			const data = await response.json();
			// Google 免费端点返回 [[["translated text", "original", ...]], ...]
			const translated = (data[0] as Array<Array<string>>)
				.map((segment) => segment[0])
				.join('');
			return translated;
		} finally {
			clearTimeout(timeoutId);
		}
	},
};
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/translation/engines/google.ts
git commit -m "feat(translate): add Google Translate engine"
```

---

### Task 3: 创建 OpenAI 翻译引擎

**Files:**
- Create: `src/lib/translation/engines/openai.ts`

- [ ] **Step 1: 写入 OpenAI 兼容翻译引擎**

```typescript
import type { Translator } from '../types.js';

const SYSTEM_PROMPT = `You are a professional translator. Translate the following Markdown text into {target_language}. Preserve all Markdown formatting, code blocks, links, and frontmatter exactly as-is. Only translate the natural language text. Do not add any explanations or extra output.`;

const LANG_NAMES: Record<string, string> = {
	'en': 'English', 'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
	'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German',
	'es': 'Spanish', 'pt': 'Portuguese', 'ru': 'Russian', 'it': 'Italian',
	'nl': 'Dutch', 'pl': 'Polish', 'sv': 'Swedish', 'vi': 'Vietnamese',
	'tr': 'Turkish', 'ar': 'Arabic', 'th': 'Thai', 'id': 'Indonesian', 'el': 'Greek',
};

export function createOpenAITranslator(endpoint: string, model: string): Translator {
	return {
		id: 'openai',
		name: 'OpenAI',
		needsApiKey: true,

		async translate(text: string, targetLang: string, apiKey: string): Promise<string> {
			const langName = LANG_NAMES[targetLang] || targetLang;
			const prompt = SYSTEM_PROMPT.replace('{target_language}', langName);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000);

			try {
				const response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: prompt },
							{ role: 'user', content: text },
						],
						temperature: 0.3,
						max_tokens: 4096,
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const errorBody = await response.text().catch(() => '');
					throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
				}

				const data = await response.json();
				return data.choices[0].message.content;
			} finally {
				clearTimeout(timeoutId);
			}
		},
	};
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/translation/engines/openai.ts
git commit -m "feat(translate): add OpenAI-compatible translation engine"
```

---

### Task 4: 创建引擎注册表

**Files:**
- Create: `src/lib/translation/registry.ts`

- [ ] **Step 1: 写入注册表**

```typescript
import type { Translator } from './types.js';
import { googleTranslator } from './engines/google.js';
import { createOpenAITranslator } from './engines/openai.js';

const registry = new Map<string, Translator>();

export function registerTranslator(translator: Translator): void {
	registry.set(translator.id, translator);
}

export function getTranslator(id: string): Translator | undefined {
	return registry.get(id);
}

export function getAvailableTranslators(): Translator[] {
	return Array.from(registry.values());
}

// 初始注册
registerTranslator(googleTranslator);
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/translation/registry.ts
git commit -m "feat(translate): add translator registry"
```

---

### Task 5: 创建 TranslationService 单例

**Files:**
- Create: `src/lib/translation/TranslationService.ts`

- [ ] **Step 1: 写入 TranslationService**

```typescript
import { settings } from '../stores/settings.svelte.js';
import { getTranslator } from './registry.js';
import { createOpenAITranslator } from './engines/openai.js';

class TranslationService {
	isTranslating = $state(false);
	sourceText = $state('');
	translatedText = $state('');
	error = $state<string | null>(null);
	showTranslateView = $state(false);

	async translate(text: string): Promise<void> {
		if (!text.trim()) {
			this.error = '文档为空，无需翻译';
			return;
		}

		this.sourceText = text;
		this.isTranslating = true;
		this.error = null;
		this.showTranslateView = true;

		try {
			const engineId = settings.defaultEngine;
			let translator = getTranslator(engineId);

			if (engineId === 'openai') {
				if (!settings.apiKeys.openai) {
					throw new Error('请先在设置中配置 OpenAI API Key');
				}
				translator = createOpenAITranslator(settings.openaiEndpoint, settings.openaiModel);
			}

			if (!translator) {
				throw new Error(`未找到翻译引擎: ${engineId}`);
			}

			const apiKey = settings.apiKeys[engineId] || '';
			this.translatedText = await translator.translate(text, settings.targetLanguage, apiKey);
		} catch (e) {
			this.error = e instanceof Error ? e.message : '翻译失败';
		} finally {
			this.isTranslating = false;
		}
	}

	closeView(): void {
		this.showTranslateView = false;
		this.translatedText = '';
		this.sourceText = '';
		this.error = null;
	}
}

export const translationService = new TranslationService();
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/translation/TranslationService.ts
git commit -m "feat(translate): add TranslationService singleton"
```

---

### Task 6: 在 SettingsStore 中添加翻译设置字段

**Files:**
- Modify: `src/lib/stores/settings.svelte.ts`

- [ ] **Step 1: 在类顶部添加新字段声明**

在 `confirmBeforeSave` 字段之后（第197行附近）新增：

```typescript
defaultEngine = $state<'openai' | 'google'>('google');
targetLanguage = $state('zh-CN');
apiKeys = $state<Record<string, string>>({ openai: '' });
openaiEndpoint = $state('https://api.apiyi.com/v1/chat/completions');
openaiModel = $state('gpt-3.5-turbo');
```

- [ ] **Step 2: 在 constructor 中添加 localStorage 读取**

在 `savedConfirmBeforeSave` 读取之后（第240行附近）新增：

```typescript
const savedDefaultEngine = localStorage.getItem('translate.defaultEngine');
const savedTargetLanguage = localStorage.getItem('translate.targetLanguage');
const savedApiKeys = localStorage.getItem('translate.apiKeys');
const savedOpenaiEndpoint = localStorage.getItem('translate.openaiEndpoint');
const savedOpenaiModel = localStorage.getItem('translate.openaiModel');

if (savedDefaultEngine === 'openai' || savedDefaultEngine === 'google') {
	this.defaultEngine = savedDefaultEngine;
}
if (savedTargetLanguage) this.targetLanguage = savedTargetLanguage;
if (savedApiKeys) {
	try { const parsed = JSON.parse(savedApiKeys); if (parsed && typeof parsed === 'object') this.apiKeys = parsed; } catch {}
}
if (savedOpenaiEndpoint) this.openaiEndpoint = savedOpenaiEndpoint;
if (savedOpenaiModel) this.openaiModel = savedOpenaiModel;
```

- [ ] **Step 3: 在 $effect 中添加 localStorage 持久化**

在最后一个 `localStorage.setItem` 之后（`confirmBeforeSave` 那行之后）新增：

```typescript
localStorage.setItem('translate.defaultEngine', this.defaultEngine);
localStorage.setItem('translate.targetLanguage', this.targetLanguage);
localStorage.setItem('translate.apiKeys', JSON.stringify(this.apiKeys));
localStorage.setItem('translate.openaiEndpoint', this.openaiEndpoint);
localStorage.setItem('translate.openaiModel', this.openaiModel);
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run check
```
Expected: PASS (无新增类型错误)

- [ ] **Step 5: 提交**

```bash
git add src/lib/stores/settings.svelte.ts
git commit -m "feat(translate): add translation fields to SettingsStore"
```

---

### Task 7: 新增 titlebarToolbar translate action

**Files:**
- Modify: `src/lib/utils/titlebarToolbar.ts`

- [ ] **Step 1: 在 TITLEBAR_TOOLBAR_ACTIONS 数组中新增 translate action**

在 `settings` action 之前（第38行附近）新增：

```typescript
{ id: 'translate', labelKey: 'menu.translate', fallbackName: 'Translate', sample: '🌐', defaultPlacement: 'bar' },
```

- [ ] **Step 2: 验证 DEFAULT_TITLEBAR_TOOLBAR_ORDER 自动包含 translate**

`DEFAULT_TITLEBAR_TOOLBAR_ORDER` 由 `TITLEBAR_TOOLBAR_ACTIONS.map((action) => action.id)` 自动生成，无需额外修改。

- [ ] **Step 3: 提交**

```bash
git add src/lib/utils/titlebarToolbar.ts
git commit -m "feat(translate): add translate action to titlebar toolbar"
```

---

### Task 8: 添加翻译相关 i18n 文本

**Files:**
- Modify: `src/lib/utils/i18n.ts`

- [ ] **Step 1: 在 `'zh-CN'` 翻译块的 `menu` 对象中添加**

找到 `'zh-CN'` 下的 `menu` 对象（约第 391 行区域），在 `exportPdf` 之后新增：

```typescript
translate: '翻译',
```

- [ ] **Step 2: 在 `'zh-CN'` 翻译块的 `settings` 对象中添加**

在 `'zh-CN'` 的 `settings` 对象末尾新增：

```typescript
translation: '翻译',
translationSettings: '翻译设置',
defaultEngine: '默认引擎',
targetLanguage: '目标语言',
apiEndpoint: 'API 端点',
apiKey: 'API Key',
model: '模型',
googleEngine: 'Google 翻译',
openaiEngine: 'OpenAI 翻译',
```

- [ ] **Step 3: 在 `'zh-CN'` 翻译块顶级添加 translateView 对象**

```typescript
translateView: {
    originalText: '原文（只读）',
    translatedText: '译文（只读）',
    backToEditor: '← 返回编辑',
    copyTranslation: '📋 复制译文',
    retry: '🔄 重试',
    translating: '翻译中...',
    emptyDocument: '文档为空，无需翻译',
    apiKeyRequired: '请先在设置中配置 API Key',
    translationFailed: '翻译失败',
    noText: '当前标签页没有可翻译的内容',
},
```

- [ ] **Step 4: 在所有其他语言的对应位置添加英文 fallback**

对其他每个语言块（`en`, `ja`, `ko` 等），在相同路径添加相同的 key，值为英文（如 `translate: 'Translate'`）。

- [ ] **Step 5: 运行类型检查**

```bash
npm run check
```
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/utils/i18n.ts
git commit -m "feat(translate): add translation i18n keys"
```

---

### Task 9: 在 Settings 中添加翻译设置 UI

**Files:**
- Modify: `src/lib/components/Settings.svelte`

- [ ] **Step 1: 扩展 activeCategory 类型**

将第20行的：
```typescript
let activeCategory = $state<'editor' | 'preview' | 'appearance' | 'toolbars' | 'files'>('editor');
```
改为：
```typescript
let activeCategory = $state<'editor' | 'preview' | 'appearance' | 'toolbars' | 'files' | 'translation'>('editor');
```

- [ ] **Step 2: 在侧边栏导航中添加翻译入口**

在 `files` 的 nav-item 之后（第331行附近）新增：

```svelte
<button class="nav-item" class:active={activeCategory === 'translation'} onclick={() => (activeCategory = 'translation')}>
	<div class="nav-label">{t('settings.translation', settings.language)}</div>
</button>
```

- [ ] **Step 3: 在内容区域添加翻译设置面板**

在 `{:else if activeCategory === 'files'}` 的闭合 `</div>` 之后（`files` 块的最后一个 `</div>` 之后）新增：

```svelte
{:else if activeCategory === 'translation'}
<div class="settings-group">
	<div class="settings-group-header">
		<h2>{t('settings.translationSettings', settings.language)}</h2>
	</div>

	<div class="setting-item">
		<label for="translate-default-engine">{t('settings.defaultEngine', settings.language)}</label>
		<select
			id="translate-default-engine"
			bind:value={settings.defaultEngine}>
			<option value="google">{t('settings.googleEngine', settings.language)}</option>
			<option value="openai">{t('settings.openaiEngine', settings.language)}</option>
		</select>
	</div>

	<div class="setting-item">
		<label for="translate-target-lang">{t('settings.targetLanguage', settings.language)}</label>
		<select
			id="translate-target-lang"
			bind:value={settings.targetLanguage}>
			<option value="zh-CN">中文简体</option>
			<option value="zh-TW">中文繁体</option>
			<option value="en">English</option>
			<option value="ja">日本語</option>
			<option value="ko">한국어</option>
			<option value="fr">Français</option>
			<option value="de">Deutsch</option>
			<option value="es">Español</option>
			<option value="pt">Português</option>
			<option value="ru">Русский</option>
			<option value="it">Italiano</option>
			<option value="nl">Nederlands</option>
			<option value="pl">Polski</option>
			<option value="sv">Svenska</option>
			<option value="vi">Tiếng Việt</option>
			<option value="tr">Türkçe</option>
			<option value="ar">العربية</option>
			<option value="th">ไทย</option>
			<option value="id">Bahasa Indonesia</option>
			<option value="el">Ελληνικά</option>
		</select>
	</div>

	<div class="settings-subsection">
		<h3>{t('settings.openaiEngine', settings.language)}</h3>

		<div class="setting-item">
			<label for="translate-openai-endpoint">{t('settings.apiEndpoint', settings.language)}</label>
			<input
				id="translate-openai-endpoint"
				type="text"
				bind:value={settings.openaiEndpoint}
				placeholder="https://api.apiyi.com/v1/chat/completions" />
		</div>

		<div class="setting-item">
			<label for="translate-openai-key">{t('settings.apiKey', settings.language)}</label>
			<input
				id="translate-openai-key"
				type="password"
				bind:value={settings.apiKeys.openai}
				placeholder="sk-..." />
		</div>

		<div class="setting-item">
			<label for="translate-openai-model">{t('settings.model', settings.language)}</label>
			<input
				id="translate-openai-model"
				type="text"
				bind:value={settings.openaiModel}
				placeholder="gpt-3.5-turbo" />
		</div>
	</div>
</div>
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run check
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/components/Settings.svelte
git commit -m "feat(translate): add translation settings UI"
```

---

### Task 10: 创建 TranslateView 组件

**Files:**
- Create: `src/lib/components/TranslateView.svelte`

- [ ] **Step 1: 写入 TranslateView 组件**

```svelte
<script lang="ts">
	import { translationService } from '../translation/TranslationService.js';
	import { t } from '../utils/i18n.js';
	import { settings } from '../stores/settings.svelte.js';

	let {
		theme = 'system',
	} = $props<{
		theme?: string;
	}>();
</script>

<div class="translate-view">
	<div class="translate-panes">
		<!-- 左面板：原文 -->
		<div class="translate-pane source-pane">
			<div class="translate-pane-header">
				{t('translateView.originalText', settings.language)}
			</div>
			<pre class="translate-content">{translationService.sourceText}</pre>
		</div>

		<!-- 分隔条 -->
		<div class="translate-split-bar"></div>

		<!-- 右面板：译文 -->
		<div class="translate-pane target-pane">
			<div class="translate-pane-header">
				{t('translateView.translatedText', settings.language)}
			</div>
			{#if translationService.isTranslating}
				<div class="translate-loading">
					{t('translateView.translating', settings.language)}
				</div>
			{:else if translationService.error}
				<div class="translate-error">
					<p>{translationService.error}</p>
				</div>
			{:else}
				<pre class="translate-content">{translationService.translatedText}</pre>
			{/if}
		</div>
	</div>

	<!-- 底栏 -->
	<div class="translate-bar">
		<button
			type="button"
			onclick={() => translationService.closeView()}>
			{t('translateView.backToEditor', settings.language)}
		</button>
		{#if !translationService.isTranslating && !translationService.error}
			<button
				type="button"
				onclick={() => navigator.clipboard.writeText(translationService.translatedText)}>
				{t('translateView.copyTranslation', settings.language)}
			</button>
		{/if}
		{#if translationService.error && !translationService.isTranslating}
			<button
				type="button"
				onclick={() => translationService.translate(translationService.sourceText)}>
				{t('translateView.retry', settings.language)}
			</button>
		{/if}
	</div>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/components/TranslateView.svelte
git commit -m "feat(translate): add TranslateView component"
```

---

### Task 11: 在 MarkdownViewer 中集成翻译功能

**Files:**
- Modify: `src/lib/MarkdownViewer.svelte`

- [ ] **Step 1: 导入 translationService 和 TranslateView**

在文件顶部的 import 区域新增：

```typescript
import { translationService } from './translation/TranslationService.js';
import TranslateView from './components/TranslateView.svelte';
```

- [ ] **Step 2: 添加 translate 处理函数**

在 `exportAsHtml` 函数附近新增：

```typescript
function handleTranslate() {
	const tab = tabManager.activeTab;
	if (!tab || !tab.rawContent.trim()) {
		translationService.error = '当前标签页没有可翻译的内容';
		return;
	}
	translationService.translate(tab.rawContent);
}
```

- [ ] **Step 3: 在 TitleBar 中添加 ontranslate prop**

在两处 TitleBar 使用位置（约第2716行和第2759行 `onexportPdf` 之后）新增：

```svelte
ontranslate={handleTranslate}
```

- [ ] **Step 4: 在主内容区域添加 TranslateView 条件渲染**

在编辑/预览区域（`{#if tabManager.activeTab && ...}` 块，约第2786行）之前添加：

```svelte
{#if translationService.showTranslateView}
	<TranslateView {theme} />
{:else if tabManager.activeTab && (tabManager.activeTab.path !== '' || tabManager.activeTab.title !== 'Recents') && !showHome}
```

将原来的 `{#if tabManager.activeTab && ...}` 改为 `{:else if tabManager.activeTab && ...}`（注意是 `{:else if`，前加冒号）。

- [ ] **Step 5: 确保原有的 `{/if}` 结束标签需要对应** — 在 `{:else if ...}` 块后原有的 `{/if}` 不需要改动，Svelte 的 `{#if}{:else if}{/if}` 共享同一个闭合标签。

- [ ] **Step 6: 运行类型检查**

```bash
npm run check
```
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/lib/MarkdownViewer.svelte
git commit -m "feat(translate): integrate TranslateView into MarkdownViewer"
```

---

### Task 12: 在 TitleBar 中添加 ontranslate prop

**Files:**
- Modify: `src/lib/components/TitleBar.svelte`

- [ ] **Step 1: 在 props 中添加 ontranslate**

在 `onexportPdf` props 附近新增：

```typescript
ontranslate,
```
（在解构声明中）

```typescript
ontranslate?: () => void;
```
（在类型声明中）

- [ ] **Step 2: 在导出按钮之后添加翻译按钮**

在 `onexportPdf` 按钮之后（第447行附近）新增：

```svelte
<button
	type="button"
	aria-label={t('menu.translate', currentLanguage)}
	onclick={() => ontranslate?.()}>
	{t('menu.translate', currentLanguage)}
</button>
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/components/TitleBar.svelte
git commit -m "feat(translate): add translate button to TitleBar"
```

---

### Task 13: 添加 TranslateView 样式

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 在文件末尾添加样式**

```css
.translate-view {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
}

.translate-panes {
	display: flex;
	flex: 1;
	overflow: hidden;
}

.translate-pane {
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.source-pane {
	border-right: 1px solid var(--color-border-default);
}

.translate-pane-header {
	padding: 8px 16px;
	font-size: 13px;
	font-weight: 600;
	color: var(--color-fg-muted);
	border-bottom: 1px solid var(--color-border-muted);
	background: var(--color-canvas-subtle);
}

.translate-content {
	flex: 1;
	margin: 0;
	padding: 16px;
	overflow: auto;
	font-family: var(--win-font);
	font-size: 14px;
	line-height: 1.6;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--color-fg-default);
	background: var(--color-canvas-default);
	user-select: text;
	-webkit-user-select: text;
}

.translate-split-bar {
	width: 2px;
	background: var(--color-border-default);
	cursor: col-resize;
	flex-shrink: 0;
}

.translate-loading {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	color: var(--color-fg-muted);
	font-size: 14px;
}

.translate-error {
	padding: 16px;
	color: var(--color-danger-fg);
	font-size: 14px;
}

.translate-bar {
	display: flex;
	gap: 8px;
	padding: 8px 16px;
	border-top: 1px solid var(--color-border-default);
	background: var(--color-canvas-subtle);
}

.translate-bar button {
	padding: 4px 12px;
	font-size: 13px;
	border: 1px solid var(--color-border-default);
	border-radius: 4px;
	background: var(--color-canvas-default);
	color: var(--color-fg-default);
	cursor: pointer;
}

.translate-bar button:hover {
	background: var(--color-neutral-muted);
}
```

- [ ] **Step 2: 提交**

```bash
git add src/styles.css
git commit -m "feat(translate): add TranslateView styles"
```

---

### Task 14: 验证和测试

- [ ] **Step 1: 运行类型检查**

```bash
npm run check
```
Expected: PASS，无类型错误

- [ ] **Step 2: 运行 Tauri 开发模式进行手动测试**

```bash
npm run tauri dev
```

手动测试清单：
1. 打开 Markpad → 确认工具栏出现 🌐 翻译按钮
2. 打开一个 Markdown 文件 → 点击翻译按钮
3. 确认分屏视图正常显示（原文左、译文右）
4. 使用 Google 引擎翻译 → 确认译文正确显示
5. 进入设置 → 切换到 OpenAI 引擎 → 配置 API Key 和端点
6. 使用 OpenAI 引擎翻译 → 确认译文正确显示
7. 点击「复制译文」→ 确认剪贴板内容正确
8. 点击「返回编辑」→ 确认回到编辑视图
9. 测试空文档 → 确认提示"文档为空"
10. 测试错误场景 → 确认错误信息显示和重试按钮

- [ ] **Step 3: 提交最终验证**

```bash
git add -A
git commit -m "chore(translate): final integration verification"
```
