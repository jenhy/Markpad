# Markpad 翻译功能开发踩坑记录

## 1. Svelte 5 `$state()` 必须在 `.svelte.ts` 文件中

**问题**：TranslationService.ts 使用 `$state()` rune 导致 500 Internal Error。

**原因**：Svelte 5 的 `$state()`、`$effect()`、`$derived()` 等 runes 只在 `.svelte`、`.svelte.ts`、`.svelte.js` 文件中生效。普通 `.ts` 文件的 `$state()` 不会经过 Svelte 编译器转换，运行时 `$state` 是 `undefined`，导致崩溃。

**解决**：将 `TranslationService.ts` 重命名为 `TranslationService.svelte.ts`，并更新所有 import 路径。

**关键文件**：`src/lib/translation/TranslationService.ts` → `TranslationService.svelte.ts`

---

## 2. Tauri CSP（内容安全策略）阻止翻译 API 请求

**问题**：点击翻译按钮后，右侧面板显示 "Failed to fetch"。

**原因**：`tauri.conf.json` 中的 CSP 配置 `connect-src: 'self'` 只允许连接同源地址，翻译引擎的 `fetch()` 调用外部 API（`https://translate.googleapis.com`、`https://api.openai.com`）被 Webview 拦截。

**解决**：将 CSP 修改为允许 HTTPS 连接：

```json
"connect-src": "'self' https:",
```

**关键文件**：`src-tauri/tauri.conf.json`

---

## 3. Svelte 模板 `{#if}`/`{:else if}` 嵌套层级导致设置面板空白

**问题**：设置 → 翻译 页面显示空白。

**原因**：翻译设置块被错误地嵌套在 `{#if settings.osType === 'macos'}` 的 `{:else}` 分支内部。由于 `osType` 不是 `macos`，运行时代码进入了 `{if}` 的 `{:else}` 块，但翻译设置逻辑不合适。

**解决**：将翻译设置提取为独立的 `{:else if activeCategory === 'translation'}` 分支，与 macOS 检测完全解耦。

**关键文件**：`src/lib/components/Settings.svelte`

---

## 4. TitleBar 缺少 translate 按钮的 visibleActionIds 和 actionItems

**问题**：翻译按钮已经添加到 `titlebarToolbar.ts` 的配置中，但标题栏上不显示。

**原因**：`TitleBar.svelte` 中有两处需要修改：
1. `visibleActionIds` 的 `$derived.by()` 中没有 `push('translate')`，所以按钮不会被渲染
2. `actionItems` snippet 中没有 `translate` 的 `{:else if id === 'translate'}` 分支，即使可见也不知道如何渲染

**解决**：
- 在 `visibleActionIds` 中加入 `list.push('translate')`
- 在 `actionItems` 中加入对应的按钮渲染代码（SVG 图标 + click 事件绑定）

**关键文件**：`src/lib/components/TitleBar.svelte`

---

## 5. MarkdownViewer 缺少 translate 按钮的 visibleActionIds

**问题**：翻译按钮在 MarkdownViewer 中也未显示。

**原因**：与 TitleBar 类似，`MarkdownViewer.svelte` 中的 `visibleActionIds` 没有包含 `translate`。

**解决**：在 `list.push('translate')` 添加到 visibleActionIds 中。

**关键文件**：`src/lib/MarkdownViewer.svelte`

---

## 6. EditorToolbar 中的 translate 按钮未移除干净

**问题**：菜单栏中的翻译按钮在文件菜单中显示。

**原因**：translate 按钮同时在 editor toolbar 和 titlebar toolbar 中添加了，需要从文件菜单（home menu）中移除但保留其他地方。

**解决**：从 `MarkdownViewer.svelte` 中文件相关的菜单代码中移除 translate 按钮的渲染代码。

**关键文件**：`src/lib/MarkdownViewer.svelte`

---

## 7. TranslateView 折叠箭头（header fold）无响应

**问题**：翻译预览页面的标题折叠箭头点击无效。

**原因**：`TranslateView.svelte` 初始使用了 `<pre>` 标签，CSS 设置 `white-space: pre-wrap` 导致 DOM 结构异常，`onclick` 事件处理函数中的 `closest('.header-fold-icon')` 找不到匹配元素。

**解决**：
- 将 `<pre>` 改为 `{@html}` 直接渲染 HTML
- 移除 CSS 中的 `white-space: pre-wrap`
- 添加正确的 `onclick` 和 `onkeydown` 事件委托

**关键文件**：`src/lib/components/TranslateView.svelte`、`src/styles.css`

---

## 8. TOC 点击同步翻译面板时 headingIndex 为 -1

**问题**：点击翻译面板的 TOC 目录时，左侧英文文档正确滚动，但右侧中文文档不滚动。

**原因**：`processBlockIds()` 将标题包裹在 `<a>` 锚点标签内，导致 `sourceEl` 是 `<a>` 标签而不是 `<h1>`-`<h6>`。`indexOf()` 找不到 `<a>` 标签，返回 `-1`，条件 `headingIndex >= 0` 不满足，跳过滚动逻辑。

**解决**：在 `indexOf` 返回 `-1` 时，通过 DOM 树向上回溯查找最近的标题元素：

```typescript
let headingIndex = sourceHeadings.indexOf(sourceEl);
if (headingIndex === -1) {
    let node: Node | null = sourceEl;
    while (node) {
        if (node.nodeType === 1) {
            const el = node as HTMLElement;
            if (/^H[1-6]$/.test(el.tagName)) {
                headingIndex = sourceHeadings.indexOf(el);
                break;
            }
        }
        if (node.previousSibling) {
            node = node.previousSibling;
            while (node && node.lastChild) node = node.lastChild;
        } else {
            node = node.parentNode;
        }
    }
}
```

**关键文件**：`src/lib/components/TranslateView.svelte`

---

## 9. comrak 生成的 heading ID 在 DOM 处理中丢失

**问题**：TOC 目录中标题的 ID 为空，导致无法跳转。

**原因**：Rust 端 comrak 配置了 `header_ids: Some(String::new())` 生成 `<h1 id="heading-id">`。但前端 `processMarkdownHtml()` 通过 DOMParser 处理 HTML 后，标题的 ID 属性在 DOM 操作中被丢失（`h.id` 和 `anchor.id` 都为空）。

**解决**：TranslateView 中的 TOC 点击使用 `data-id` 属性配合 `querySelector` 查找元素，不依赖 `h.id`。

**关键文件**：`src-tauri/src/lib.rs`（comrak 配置）、`src/lib/utils/markdown.ts`（processMarkdownHtml）

---

## 10. Tauri 构建使用代理时 localhost 请求被拦截

**问题**：`npm run tauri build` 报错 `protocol: http response missing version`。

**原因**：Tauri 的 NSIS 打包阶段会检查 updater endpoint。用户配置了 `http_proxy=http://127.0.0.1:22222`，Rust 的 HTTP 客户端（reqwest）不会像 curl 那样自动绕过代理访问 localhost。结果 `http://localhost:8899/latest.json` 的请求走了代理，代理返回的不是有效 JSON。

**解决**：设置 `NO_PROXY=localhost,127.0.0.1` 环境变量：

```powershell
set NO_PROXY=localhost,127.0.0.1
set no_proxy=localhost,127.0.0.1
```

**关键文件**：构建环境配置

---

## 11. 安装了错误的 endpoint 导致 exe 启动崩溃

**问题**：安装后双击程序没有反应。

**原因**：构建时 `tauri.conf.json` 中的 updater endpoint 还是临时用的 `http://localhost:8899/latest.json`。Tauri 在启动时会验证 endpoint 必须是 `https://` 协议，`http://` 被拒绝，启动崩溃。

**解决**：将 endpoint 恢复为 `https://github.com/alecdotdev/Markpad/releases/latest/download/latest.json`，然后重新构建。

**关键文件**：`src-tauri/tauri.conf.json`

---

## 12. Edit 工具无法处理 tab 缩进的文件

**问题**：使用 Edit 工具编辑 Settings.svelte 时始终匹配失败。

**原因**：项目文件使用 tab 缩进，Edit 工具在处理 tab 字符时匹配不正确。

**解决**：使用 sed / Python 脚本作为替代方案进行编辑。

**工具限制**：Claude Code Edit tool + tab 缩进 = 不兼容

---

## 13. 翻译按钮配置 required: true 但依然不显示

**问题**：`titlebarToolbar.ts` 配置了 `required: true`，清空 localStorage 后翻译按钮也不显示。

**原因**：代码 bug 才是根本原因（见第 4 条），`required: true` 只影响本地存储中不得隐藏的机制，但 visibleActionIds 和 actionItems 的缺失导致按钮根本没有被渲染。

**解决**：修复 TitleBar.svelte 中 visibleActionIds 和 actionItems 的代码。

**关键文件**：`src/lib/utils/titlebarToolbar.ts`、`src/lib/components/TitleBar.svelte`
