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

		async translate(text: string, targetLang: string, apiKey?: string): Promise<string> {
			const langName = LANG_NAMES[targetLang] || targetLang;
			const prompt = SYSTEM_PROMPT.replace('{target_language}', langName);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000);

			try {
				const response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${apiKey || ''}`,
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
