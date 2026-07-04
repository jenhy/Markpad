import type { Translator } from '../types.js';

export const googleTranslator: Translator = {
	id: 'google',
	name: 'Google Translate',
	needsApiKey: false,

	async translate(text: string, targetLang: string, _apiKey?: string): Promise<string> {
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
