import { settings } from '../stores/settings.svelte.js';
import { getTranslator } from './registry.js';
import { createOpenAITranslator } from './engines/openai.js';

class TranslationService {
	isTranslating = $state(false);
	sourceText = $state('');
	translatedText = $state('');
	error = $state<string | null>(null);
	showTranslateView = $state(false);

	private lastContentHash = '';
	private lastEngineFingerprint = '';

	private hashContent(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0;
		}
		return hash.toString(36);
	}

	private getEngineFingerprint(): string {
		return [
			settings.defaultEngine,
			settings.targetLanguage,
			settings.apiKeys[settings.defaultEngine] || '',
			settings.openaiEndpoint,
			settings.openaiModel,
		].join('|');
	}

	async translate(text: string): Promise<void> {
		if (!text.trim()) {
			this.error = '文档为空，无需翻译';
			return;
		}

		const contentHash = this.hashContent(text);
		const fingerprint = this.getEngineFingerprint();

		this.sourceText = text;
		this.showTranslateView = true;

		// 缓存命中：相同内容 + 相同引擎配置 → 直接显示已有翻译结果
		if (contentHash === this.lastContentHash && fingerprint === this.lastEngineFingerprint && this.translatedText) {
			this.isTranslating = false;
			this.error = null;
			return;
		}

		this.isTranslating = true;
		this.error = null;

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
			this.lastContentHash = contentHash;
			this.lastEngineFingerprint = fingerprint;
		} catch (e) {
			this.error = e instanceof Error ? e.message : '翻译失败';
		} finally {
			this.isTranslating = false;
		}
	}

	closeView(): void {
		this.showTranslateView = false;
		this.error = null;
		// 不清空 translatedText / sourceText / lastContentHash → 再次打开时走缓存
	}
}

export const translationService = new TranslationService();
