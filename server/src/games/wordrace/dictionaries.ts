import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWordList,
  registerDictionary,
  loadedLanguages,
} from '../../../../shared/wordrace/dictionary.js';
import { LANGUAGE_CODES, type LanguageCode } from '../../../../shared/wordrace/languages.js';

/**
 * Word Race dictionaries live as generated text files next to the shared code.
 * They are read once at startup: ~12k English and ~6k French words is a few
 * hundred KB in memory, and keeping them out of the JS bundle means the client
 * never downloads them.
 *
 * Regenerate with `npm run build:dict`.
 */
const dictDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../shared/wordrace/dict');

function readList(file: string): string[] {
  try {
    return parseWordList(readFileSync(path.join(dictDir, file), 'utf8'));
  } catch (err) {
    throw new Error(
      `Could not read Word Race dictionary "${file}" from ${dictDir}. ` +
        `Run "npm run build:dict" to generate it. (${(err as Error).message})`,
    );
  }
}

/** Load every language's word lists. Throws if any language is unusable. */
export function loadWordRaceDictionaries(): void {
  if (loadedLanguages().length === LANGUAGE_CODES.length) return; // already loaded

  for (const language of LANGUAGE_CODES) {
    const guesses = readList(`${language}-guesses.txt`);
    const answers = readList(`${language}-answers.txt`);
    if (guesses.length === 0) throw new Error(`Word Race: ${language} has no accepted guesses.`);
    if (answers.length === 0) throw new Error(`Word Race: ${language} has no answers.`);

    const guessSet = new Set(guesses);
    // An answer that is not a legal guess would be unsolvable.
    const orphans = answers.filter((a) => !guessSet.has(a));
    if (orphans.length) {
      throw new Error(`Word Race: ${language} answers missing from the guess list: ${orphans.slice(0, 5).join(', ')}`);
    }

    registerDictionary({ language: language as LanguageCode, guesses: guessSet, answers });
    console.log(`[party-games] wordrace ${language}: ${guesses.length} guesses, ${answers.length} answers`);
  }
}
