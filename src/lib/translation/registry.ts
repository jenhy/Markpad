import type { Translator } from './types.js';
import { googleTranslator } from './engines/google.js';

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
