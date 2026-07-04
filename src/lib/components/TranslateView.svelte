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
		<!-- Left pane: source text -->
		<div class="translate-pane source-pane">
			<div class="translate-pane-header">
				{t('translateView.originalText', settings.language)}
			</div>
			<pre class="translate-content">{translationService.sourceText}</pre>
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
				<pre class="translate-content">{translationService.translatedText}</pre>
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
