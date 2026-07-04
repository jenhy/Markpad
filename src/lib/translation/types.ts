export interface Translator {
	id: string;
	name: string;
	needsApiKey: boolean;
	translate(text: string, targetLang: string, apiKey: string): Promise<string>;
}
