<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { translationService } from '../translation/TranslationService.svelte.js';
	import { t } from '../utils/i18n.js';
	import { settings } from '../stores/settings.svelte.js';
	import { processMarkdownHtml } from '../utils/markdown.js';
	import Toc from './Toc.svelte';

	let {
		theme = 'system',
	} = $props<{
		theme?: string;
	}>();

	let sourceHtml = $state('');
	let translatedHtml = $state('');
	let sourceBody: HTMLElement | null = $state(null);

	async function renderMarkdown(content: string): Promise<string> {
		const rawHtml = await invoke<string>('render_markdown', { content });
		return processMarkdownHtml(rawHtml, content, new Set<string>());
	}

	$effect(() => {
		if (translationService.sourceText) {
			renderMarkdown(translationService.sourceText).then((html) => (sourceHtml = html));
		}
	});

	$effect(() => {
		if (translationService.translatedText) {
			renderMarkdown(translationService.translatedText).then((html) => (translatedHtml = html));
		}
	});

	function handleHeaderFoldClick(e: MouseEvent | KeyboardEvent) {
		const target = e.target as HTMLElement;
		const foldIcon = target.closest('.header-fold-icon');
		if (!foldIcon) return;
		const foldableHeader = foldIcon.closest('.foldable-header') as HTMLElement | null;
		if (!foldableHeader) return;
		e.preventDefault();
		e.stopPropagation();
		const wrapId = foldableHeader.getAttribute('data-fold-target');
		const wrapper = wrapId ? document.getElementById(wrapId) : null;
		if (!wrapper) return;
		const isCollapsed = foldableHeader.classList.toggle('is-collapsed');
		wrapper.classList.toggle('is-collapsed', isCollapsed);
	}

	function handleTocClick(e: MouseEvent | KeyboardEvent) {
		const target = e.target as HTMLElement;
		const tocLink = target.closest('.toc-link') as HTMLElement | null;
		if (!tocLink) return;

		const id = tocLink.getAttribute('data-id');
		if (!id || !sourceBody) return;

		const targetEl = document.getElementById('translate-target-content');
		if (!targetEl) return;

		const sourceEl = sourceBody.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null;
		if (!sourceEl) return;

		const sourceHeadings = Array.from(sourceBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
		const targetHeadings = targetEl.querySelectorAll('h1, h2, h3, h4, h5, h6');

		// Find the best matching heading: if sourceEl is itself a heading, use it directly.
		// Otherwise, find the nearest preceding heading in the DOM.
		let headingIndex = sourceHeadings.indexOf(sourceEl);
		if (headingIndex === -1) {
			// Walk backwards through the DOM to find the nearest heading
			let node: Node | null = sourceEl;
			while (node) {
				if (node.nodeType === 1) {
					const el = node as HTMLElement;
					if (/^H[1-6]$/.test(el.tagName)) {
						headingIndex = sourceHeadings.indexOf(el);
						break;
					}
				}
				// Try previous sibling, then parent
				if (node.previousSibling) {
					node = node.previousSibling;
					// Dive into last child of previous sibling
					while (node && node.lastChild) {
						node = node.lastChild;
					}
				} else {
					node = node.parentNode;
				}
			}
		}

		if (headingIndex >= 0 && headingIndex < targetHeadings.length) {
			targetHeadings[headingIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}
</script>

<div class="translate-view">
	<div class="translate-panes">
		<!-- Left pane: source text with TOC -->
		<div class="translate-pane source-pane">
			<div class="translate-pane-header">
				{t('translateView.originalText', settings.language)}
			</div>
			<div class="source-with-toc">
				{#if sourceHtml}
					<div class="translate-toc-sidebar" role="navigation" onclick={handleTocClick} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTocClick(e)}>
						<Toc
							markdownBody={sourceBody}
							htmlContent={sourceHtml}
						/>
					</div>
				{/if}
				<div
					bind:this={sourceBody}
					class="translate-content markdown-preview"
					style="overflow-y: auto;"
					role="button"
					tabindex="0"
					onclick={handleHeaderFoldClick}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderFoldClick(e)}
				>
					{@html sourceHtml || '<p>' + t('translateView.originalText', settings.language) + '</p>'}
				</div>
			</div>
		</div>

		<!-- Splitter -->
		<div class="translate-split-bar"></div>

		<!-- Right pane: translated text -->
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
				<div
					id="translate-target-content"
					class="translate-content markdown-preview"
					style="overflow-y: auto;"
					role="button"
					tabindex="0"
					onclick={handleHeaderFoldClick}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderFoldClick(e)}
				>
					{@html translatedHtml || '<p>' + t('translateView.translatedText', settings.language) + '</p>'}
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom bar -->
	<div class="translate-bar">
		<button type="button" onclick={() => translationService.closeView()}>
			{t('translateView.backToEditor', settings.language)}
		</button>
		{#if !translationService.isTranslating && !translationService.error}
			<button type="button" onclick={() => navigator.clipboard.writeText(translationService.translatedText)}>
				{t('translateView.copyTranslation', settings.language)}
			</button>
		{/if}
		{#if translationService.error && !translationService.isTranslating}
			<button type="button" onclick={() => translationService.translate(translationService.sourceText)}>
				{t('translateView.retry', settings.language)}
			</button>
		{/if}
	</div>
</div>
