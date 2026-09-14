import { WORD_LENGTH } from './types.js';
import { foldWord, type LanguageCode } from './languages.js';

/**
 * A language's word data: every accepted guess, plus the subset that can be a
 * secret answer. Kept as a Set for O(1) guess validation.
 */
export interface Dictionary {
  language: LanguageCode;
  guesses: ReadonlySet<string>;
  answers: readonly string[];
}

/** Registry populated at startup. The server loads from disk; tests inject. */
const registry = new Map<LanguageCode, Dictionary>();

export function registerDictionary(dict: Dictionary): void {
  registry.set(dict.language, dict);
}

export function getDictionary(language: LanguageCode): Dictionary {
  const dict = registry.get(language);
  if (!dict) throw new Error(`Dictionary for "${language}" is not loaded`);
  return dict;
}

export function hasDictionary(language: LanguageCode): boolean {
  return registry.has(language);
}

export function loadedLanguages(): LanguageCode[] {
  return [...registry.keys()];
}

/** Test helper: forget everything, so suites do not leak into each other. */
export function clearDictionaries(): void {
  registry.clear();
}

/** Parse a newline-separated word file into a dictionary-ready list. */
export function parseWordList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const word = foldWord(line);
    if (word.length === WORD_LENGTH && /^[A-Z]+$/.test(word)) out.push(word);
  }
  return out;
}

export interface CustomListResult {
  /** Accepted, de-duplicated, folded words. */
  words: string[];
  /** Entries that were dropped, with the reason, for host feedback. */
  rejected: { word: string; reason: string }[];
}

export const MAX_CUSTOM_WORDS = 500;
/** Below this a game would repeat answers almost immediately. */
export const MIN_CUSTOM_WORDS = 5;

/**
 * Validate a host's pasted word list. Splits on any whitespace, commas or
 * semicolons, folds accents, and reports why anything was dropped. Words need
 * not be in the dictionary — a host may want a themed or invented set — but
 * they must be the right shape to be playable.
 */
export function parseCustomList(raw: string): CustomListResult {
  const tokens = String(raw ?? '')
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const words: string[] = [];
  const rejected: { word: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (words.length >= MAX_CUSTOM_WORDS) {
      rejected.push({ word: token, reason: `over the ${MAX_CUSTOM_WORDS}-word limit` });
      continue;
    }
    const folded = foldWord(token);
    if (!/^[A-Z]+$/.test(folded)) {
      rejected.push({ word: token, reason: 'letters only' });
      continue;
    }
    if (folded.length !== WORD_LENGTH) {
      rejected.push({ word: token, reason: `${folded.length} letters, needs ${WORD_LENGTH}` });
      continue;
    }
    if (seen.has(folded)) {
      rejected.push({ word: token, reason: 'duplicate' });
      continue;
    }
    seen.add(folded);
    words.push(folded);
  }

  return { words, rejected };
}

/**
 * Is this guess a real word? The language dictionary is authoritative, plus any
 * custom answers the host supplied (so a themed word is always guessable).
 */
export function isAcceptedGuess(word: string, language: LanguageCode, customWords: readonly string[] = []): boolean {
  const folded = foldWord(word);
  if (folded.length !== WORD_LENGTH) return false;
  if (customWords.includes(folded)) return true;
  return getDictionary(language).guesses.has(folded);
}
