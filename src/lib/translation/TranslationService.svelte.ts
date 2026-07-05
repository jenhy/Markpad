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
