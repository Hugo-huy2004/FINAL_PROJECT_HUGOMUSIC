import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslationDict, TranslationKey, TranslationParams, LanguageMeta } from './types';
import { BUILTIN_LOCALES, INITIAL_SUPPORTED_LANGUAGES, vi, en } from './locales';

const LANGUAGE_STORAGE_KEY = 'hugo_app_language';

// Global in-memory registry of locales and their translation dictionaries
const localeRegistry: Record<string, TranslationDict> = {};
for (const [code, entry] of Object.entries(BUILTIN_LOCALES)) {
  localeRegistry[code] = entry.translations;
}

const supportedLanguagesRegistry: LanguageMeta[] = [...INITIAL_SUPPORTED_LANGUAGES];

interface I18nState {
  language: string;
  supportedLanguages: LanguageMeta[];
  setLanguage: (lang: string) => Promise<void>;
  registerLanguage: (meta: LanguageMeta, dict: Partial<TranslationDict>) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

// Parameter replacement helper for "{name}" and "{{name}}"
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    const stringValue = String(value);
    result = result
      .replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), stringValue)
      .replace(new RegExp(`\\{${key}\\}`, 'g'), stringValue);
  }
  return result;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  language: 'vi', // Default is Vietnamese
  supportedLanguages: supportedLanguagesRegistry,

  setLanguage: async (lang: string) => {
    // Only switch if the language is registered, or fallback to 'vi'
    const targetLang = localeRegistry[lang] ? lang : 'vi';
    set({ language: targetLang });
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, targetLang);
    } catch {
      // Storage error ignored
    }
  },

  registerLanguage: (meta: LanguageMeta, dict: Partial<TranslationDict>) => {
    // Merge provided dictionary with English fallback so missing keys still work seamlessly
    const mergedDict: TranslationDict = {
      ...en,
      ...dict,
    };
    localeRegistry[meta.code] = mergedDict;

    const existingIdx = supportedLanguagesRegistry.findIndex((l) => l.code === meta.code);
    if (existingIdx >= 0) {
      supportedLanguagesRegistry[existingIdx] = meta;
    } else {
      supportedLanguagesRegistry.push(meta);
    }

    set({ supportedLanguages: [...supportedLanguagesRegistry] });
  },

  t: (key: TranslationKey, params?: TranslationParams): string => {
    const currentLang = get().language;
    const currentDict = localeRegistry[currentLang];
    
    // Priority: current language -> English -> Vietnamese -> key itself
    const rawTemplate =
      currentDict?.[key] ||
      localeRegistry.en?.[key] ||
      localeRegistry.vi?.[key] ||
      key;

    return interpolate(rawTemplate, params);
  },
}));

// Initialize language from persisted storage
(async () => {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && localeRegistry[saved]) {
      useI18nStore.getState().setLanguage(saved);
    }
  } catch {
    // Ignore init storage error
  }
})();

export function useTranslation() {
  const language = useI18nStore((state) => state.language);
  const setLanguage = useI18nStore((state) => state.setLanguage);
  const registerLanguage = useI18nStore((state) => state.registerLanguage);
  const supportedLanguages = useI18nStore((state) => state.supportedLanguages);
  const t = useI18nStore((state) => state.t);

  const currentLanguageMeta =
    supportedLanguages.find((l) => l.code === language) ||
    supportedLanguages[0];

  return {
    language,
    setLanguage,
    registerLanguage,
    supportedLanguages,
    currentLanguageMeta,
    t,
    isVietnamese: language === 'vi',
    isEnglish: language === 'en',
  };
}

export { TranslationKey, TranslationParams, LanguageMeta, TranslationDict } from './types';
export { BUILTIN_LOCALES, INITIAL_SUPPORTED_LANGUAGES } from './locales';
