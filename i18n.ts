// This is a simplified i18n system for the quiz application.
// In a larger application, you might use a library like i18next.

import { translations } from './translations';

export type Language = keyof typeof translations;

export const supportedLanguages: { code: Language; name: string; flag: string }[] = [
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

const langToSpeechCode: Record<Language, string> = {
    ru: 'ru-RU',
    en: 'en-US',
    de: 'de-DE',
    fr: 'fr-FR',
    es: 'es-ES',
    zh: 'zh-CN',
    ko: 'ko-KR',
};

const langToName: Record<Language, string> = {
    ru: 'Russian',
    en: 'English',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
    zh: 'Chinese',
    ko: 'Korean',
};

/**
 * Retrieves a translated string for a given key and language.
 * Supports simple interpolation with {{variable}}.
 * @param key The key of the string to translate.
 * @param lang The target language.
 * @param options An optional object with values to interpolate.
 * @returns The translated string.
 */
export function t(key: string, lang: Language, options?: Record<string, string | number>): string {
    const langStrings = translations[lang] || translations.en;
    let text: string = langStrings[key] || translations.en[key] || `[${key}]`;
    
    if (options && typeof text === 'string') {
        Object.entries(options).forEach(([varName, value]) => {
            text = text.replace(new RegExp(`{{${varName}}}`, 'g'), String(value));
        });
    }

    return text;
}

export function getSpeechLang(lang: Language): string {
    return langToSpeechCode[lang] || 'en-US';
}

export function getLanguageName(lang: Language): string {
    return langToName[lang] || 'English';
}
