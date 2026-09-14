/** Languages Word Race can be played in. */
export type LanguageCode = 'en' | 'fr';

export interface LanguageInfo {
  code: LanguageCode;
  /** Shown in the host's picker. */
  name: string;
  /** The language's own name, for players who do not read the UI language. */
  nativeName: string;
}

export const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  en: { code: 'en', name: 'English', nativeName: 'English' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français' },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES;
}

/**
 * Fold accents and upper-case, so ÉTAIT and etait both become ETAIT. The
 * generated dictionaries are folded the same way, so comparisons line up.
 */
export function foldWord(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}
