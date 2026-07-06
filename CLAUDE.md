# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Markpad is a Tauri v2 desktop Markdown editor — Svelte 5 + TypeScript frontend, Rust backend. See `AGENTS.md` for coding style (rune patterns, naming, props typing, formatting). This file covers architecture and patterns that span multiple files.

## Build / Test Commands

```bash
npm run tauri dev          # Full Tauri app in dev mode
npm run tauri build        # Production build
npm run check              # Type-check (svelte-check)
npm run test:workflows     # Node test suite (scripts/*.test.ts)
npm run test:frontmatter   # Frontmatter parser tests only
cargo test                 # Rust tests (in src-tauri/)
```

There are no frontend component tests — only `scripts/*.test.ts` workflow tests and Rust unit tests.

## Architecture

### SPA Shell

The app runs as a single-page application (`src/routes/+layout.ts`: `ssr: false`). The sole route `+page.svelte` renders `<MarkdownViewer />`, which is the application shell (~3000 lines) containing all window-level logic: file open/save, keyboard shortcuts, menu events, drag-and-drop, TOC, find bar, settings modal, export, zoom, auto-reload, installer mode.

### State: Two Singleton Stores

All reactive state lives in two Svelte 5 rune-based stores, each exported as a singleton instance:

- **`settings`** (`src/lib/stores/settings.svelte.ts`) — `SettingsStore` class. All editor preferences (minimap, word wrap, vim mode, fonts, zen mode, toolbar customization, language, auto-save, translation engine config, etc.). Persisted via `$effect` → `localStorage`. OS type fetched once via `invoke('get_os_type')` on init.

- **`tabManager`** (`src/lib/stores/tabs.svelte.ts`) — `TabManager` class. Tab lifecycle: create, close, reorder, cycle, split toggle, scroll sync, navigation history (goBack/goForward using `tabHistory.ts`). The `Tab` interface has fields for Monaco editor view state, scroll position, dirty tracking, and split-view state.

Both are plain TypeScript classes using `$state()` for reactivity — not Svelte's legacy `writable`/`derived` stores.

Additional singleton services:
- **`updateManager`** (`src/lib/stores/update.svelte.ts`) — Tauri updater plugin integration, auto-update lifecycle
- **`translationService`** (`src/lib/translation/TranslationService.svelte.ts`) — translation pipeline orchestration

### Rust Backend (Tauri Commands)

All Tauri commands are defined in `src-tauri/src/lib.rs`. Key patterns:

- **File I/O**: All reads/writes go through Rust. The `atomic_write` function writes to a temp file, fsyncs, then renames atomically to prevent corruption.
- **Markdown rendering**: `comrak` crate with extensions (strikethrough, tables, autolink, task lists, footnotes, description lists, header IDs, sourcepos). Custom pre-processing for wikilinks (`[[#id|alias]]`, `==highlight==`, `^[inline footnote]`, `^block-id`, `![[embed]]`).
- **Clipboard**: `arboard` crate — text and image (PNG-encoded, macOS Retina scaling optional).
- **File watching**: `notify` crate. `watch_file` emits `file-changed` event; `unwatch_file` clears the watcher.
- **Theme fetching**: Downloads VS Code themes from VSIX packages (gallery API → ZIP → extract JSON → save to app config dir).
- **Single-instance**: `tauri_plugin_single_instance` — second launch emits `file-path` event to the existing window.
- **OS detection**: `is_win11` (reads Windows registry), `get_os_type` (compile-time `cfg`), `get_system_fonts` (font-kit).

### Markdown Rendering Pipeline

Two paths exist for markdown rendering:

1. **Preview (full document)**: Frontend calls `invoke('render_markdown', { content })` → Rust renders via comrak → HTML returned. Frontend then post-processes with `processMarkdownHtml()` for code highlighting (hljs), math (KaTeX), mermaid, DOM sanitization (DOMPurify), and YouTube/image embeds.

2. **Editor live preview**: Same post-processing pipeline, but triggered on content changes in the Monaco editor with 50ms debounce.

### Translation System

`src/lib/translation/` contains a pluggable translation engine system:

- **`Translator` interface** (`types.ts`): `{ id, name, needsApiKey, translate(text, targetLang, apiKey?) }`
- **Engine registry** (`registry.ts`): `Map<string, Translator>` — engines register at import time; `getTranslator(id)` for retrieval
- **Google Translate** (`engines/google.ts`): bundled, no API key required, uses public Google Translate endpoint
- **OpenAI** (`engines/openai.ts`): created dynamically with `createOpenAITranslator(endpoint, model)` — endpoint and model are user-configurable
- **`TranslationService`** (`TranslationService.svelte.ts`): singleton managing translation state — `isTranslating`, `sourceText`, `translatedText`, `error`, `showTranslateView`. Calls the active engine from the registry, stores results as state. Frontend accessible as `translationService`
- **`TranslateView`** (`TranslateView.svelte`): side-by-side original/translated panel, synced with TOC navigation

Translation settings live in the `SettingsStore`:
- `defaultEngine` (default: `'google'`)
- `apiKeys` (record of engine → key, e.g. `{ openai: 'sk-...' }`)
- `openaiEndpoint`, `openaiModel`, `targetLanguage`

### i18n / Internationalization

`src/lib/utils/i18n.ts` is a large (~260KB) translations module supporting 25 languages (en, ja, zh-CN, zh-TW, ko, ru, es, fr, de, pt-BR, it, pl, nl, sv, vi, pt, ro, hu, cs, sk, el, fi, da, no, id, tr). The UI language is stored in `settings.language` (detected from `navigator.language` on first launch) and all UI strings go through a translation lookup by key.

### Component Map (key files)

- `MarkdownViewer.svelte` — App shell: tab bar, editor/preview panels, menus, shortcuts, file dialogs, translation integration
- `Editor.svelte` — Monaco editor wrapper, manages editor lifecycle, split-view rendering, drag-drop
- `EditorToolbar.svelte` — Editor formatting toolbar (bold, italic, headings, etc.), customizable via settings
- `Settings.svelte` — Modal settings panel, toolbar customization (drag-to-reorder, hide/show), translation engine config
- `TitleBar.svelte` — Custom titlebar (Windows/Linux), toolbar buttons with placement control (bar/menu/overflow)
- `ContextMenu.svelte` — Right-click context menu, used in both editor and preview
- `HomePage.svelte` — Recent files list, special "HOME" tab type
- `Toc.svelte` — Table of contents sidebar, pinned or overlay mode, syncs with translation view
- `TranslateView.svelte` — Split translation panel showing original/translated text, integrated into MarkdownViewer
- `FindBar.svelte` — In-editor search/replace bar
- `UpdateDialog.svelte` — Auto-update notification dialog (Tauri updater plugin)

### Adding a Tauri Command

1. Define the `#[tauri::command]` function in `src-tauri/src/lib.rs`
2. Register it in the `tauri::generate_handler![]` macro at the bottom of `run()`
3. Call from frontend: `import { invoke } from '@tauri-apps/api/core'; await invoke<ReturnType>('command_name', { arg: value })`

### Toolbar Customization

Two independent toolbars exist, both persisted in `settings`:

- **Editor toolbar** (formatting buttons above the editor): `editorToolbarOrder` (display order), `editorToolbarHidden` (hidden IDs). Orchestration in `editorToolbar.ts`.
- **Titlebar toolbar** (window-level actions): `titlebarToolbarOrder`, `titlebarToolbarHidden`, `titlebarToolbarPlacement` (per-action placement: left/right/overflow). Orchestration in `titlebarToolbar.ts`.

Both support `moveUp`/`moveDown` (adjacent swap) and drag-to-reorder. The settings UI (in `Settings.svelte`) uses these utilities directly.

### Export System

- HTML export: Renders markdown via Rust, post-processes to embed images as data URLs, rewrites relative links. Orchestrated by `exportHtml.ts`.
- PDF export: Opens the print dialog on a hidden iframe containing the rendered HTML.
- Both export flows ask the user whether to open the file afterward via `openExportedFile.ts`.

### Frontmatter

`frontMatter.ts` parses YAML frontmatter with the `yaml` package. Used by:
- Export HTML (renders frontmatter as a static table in the exported document)
- `tabFileActions.ts` for file title inference

## Versioning

Bump both `package.json` `version` and `src-tauri/Cargo.toml` `version` in the same commit. Tauri's updater compares against `Cargo.toml`.

## Critical Constraints

- **Never modify `plugins.updater.pubkey`** in `src-tauri/tauri.conf.json`. It is a maintainer-set value that, if changed, breaks auto-update for all existing users.
- No Node.js `fs` — all file operations must use Tauri `invoke` commands.
- No SSR — the app is SPA-only (adapter-static with fallback).
- The app has three modes: `app`, `installer` (`--install` flag), `uninstall` (`--uninstall` flag), determined by `get_app_mode()`.
