import { vi, metaVi } from './vi';
import { en, metaEn } from './en';
import { TranslationDict, LanguageMeta } from '../types';

export const BUILTIN_LOCALES: Record<string, { meta: LanguageMeta; translations: TranslationDict }> = {
  vi: { meta: metaVi, translations: vi },
  en: { meta: metaEn, translations: en },
};

export const INITIAL_SUPPORTED_LANGUAGES: LanguageMeta[] = [
  metaVi,
  metaEn,
];

export { vi, metaVi } from './vi';
export { en, metaEn } from './en';
