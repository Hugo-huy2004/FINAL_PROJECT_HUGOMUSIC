import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslationDict, TranslationKey, TranslationParams } from './types';
import { vi } from './locales/vi';
import { en } from './locales/en';

// Hai ngôn ngữ của app (Tài khoản › Ngôn ngữ). Lựa chọn lưu trong máy.
export type Language = 'vi' | 'en';
const DICTS: Record<Language, TranslationDict> = { vi, en };
const LANGUAGE_STORAGE_KEY = 'hugo_app_language';

// Thay "{name}" và "{{name}}" bằng tham số.
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    const v = String(value);
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), v).replace(new RegExp(`\\{${key}\\}`, 'g'), v);
  }
  return result;
}

const useI18nStore = create<{
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}>((set, get) => ({
  language: 'vi',
  setLanguage: async (lang) => {
    set({ language: lang });
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
  },
  // Thiếu bản dịch thì dùng tiếng Việt, cuối cùng là chính khoá.
  t: (key, params) => interpolate(DICTS[get().language][key] || vi[key] || key, params),
}));

AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((saved) => {
    if (saved === 'vi' || saved === 'en') useI18nStore.setState({ language: saved });
  })
  .catch(() => {});

export function useTranslation() {
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const t = useI18nStore((s) => s.t);
  return { language, setLanguage, t };
}

export type { TranslationKey, TranslationParams, TranslationDict } from './types';
