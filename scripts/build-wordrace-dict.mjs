/**
 * Generates Word Race dictionaries from MIT-licensed offline word lists.
 *
 *   node scripts/build-wordrace-dict.mjs
 *
 * Writes, per language, into shared/wordrace/dict/:
 *   <lang>-guesses.txt  every accepted five-letter guess (one per line)
 *   <lang>-answers.txt  the subset used as secret answers (common words only)
 *
 * The generated files are committed, so neither the app nor CI needs the
 * source packages at runtime — they are devDependencies only.
 *
 * Sources: an-array-of-english-words (MIT), an-array-of-french-words (MIT).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'shared/wordrace/dict');

/**
 * Both source packages ship a bare index.json. Read it off disk rather than
 * importing, so we do not depend on Node's JSON-module attribute syntax.
 */
function loadWords(pkg) {
  const file = path.join(root, 'node_modules', pkg, 'index.json');
  if (!existsSync(file)) {
    throw new Error(`${pkg} is not installed. Run: npm install --save-dev ${pkg}`);
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${pkg}: expected a JSON array of words`);
  return data;
}

/** Strip accents so ÉTAIT and ETAIT are the same five letters. */
function fold(word) {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/**
 * A word qualifies as a guess if, after folding accents, it is exactly five
 * A-Z letters. Anything with punctuation, digits or spaces is dropped, as are
 * capitalised source entries (proper nouns).
 */
function fiveLetterSet(words) {
  const out = new Set();
  for (const raw of words) {
    if (typeof raw !== 'string') continue;
    // Proper nouns arrive capitalised in these lists; skip them.
    if (raw !== raw.toLowerCase()) continue;
    const folded = fold(raw);
    if (/^[A-Z]{5}$/.test(folded)) out.add(folded);
  }
  return out;
}

/**
 * Answers must be words players can reasonably be expected to know, so we
 * intersect the dictionary with a curated "common" list where we have one.
 * Everything else stays a legal guess but never becomes the secret word.
 */
function pickAnswers(guesses, curated) {
  const answers = new Set();
  for (const word of curated) {
    const folded = fold(word);
    if (guesses.has(folded)) answers.add(folded);
  }
  return answers;
}

function writeList(file, set) {
  const sorted = [...set].sort();
  writeFileSync(file, sorted.join('\n') + '\n', 'utf8');
  return sorted.length;
}

const languages = [];

// --- English -----------------------------------------------------------------
{
  const guesses = fiveLetterSet(loadWords('an-array-of-english-words'));
  // Reuse the existing hand-picked answer list as the "common words" seed.
  const existing = readFileSync(path.join(root, 'shared/wordrace/words.ts'), 'utf8');
  const curated = [...existing.matchAll(/'([A-Za-z]{5})'/g)].map((m) => m[1]);
  const answers = pickAnswers(guesses, curated);
  languages.push({ code: 'en', guesses, answers, curatedCount: curated.length });
}

// --- French ------------------------------------------------------------------
{
  const guesses = fiveLetterSet(loadWords('an-array-of-french-words'));
  // Taking the whole dictionary as answers yields conjugated verb forms
  // (FORAI, LUTAS) and obscurities nobody can guess, so answers come from a
  // curated list of everyday words. Entries not in the dictionary, or not five
  // letters once folded, are reported and skipped.
  const seedFile = path.join(root, 'scripts/data/fr-common.txt');
  const seed = readFileSync(seedFile, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean);
  const fiveLetterSeed = seed.filter((w) => fold(w).length === 5);
  const answers = pickAnswers(guesses, fiveLetterSeed);
  const missing = fiveLetterSeed.filter((w) => !guesses.has(fold(w)));
  if (missing.length) {
    console.warn(`fr: ${missing.length} curated words are not in the dictionary and were skipped:`);
    console.warn('   ' + missing.join(' '));
  }
  languages.push({ code: 'fr', guesses, answers, curatedCount: fiveLetterSeed.length });
}

mkdirSync(outDir, { recursive: true });

const summary = [];
for (const { code, guesses, answers, curatedCount } of languages) {
  if (guesses.size < 1000) throw new Error(`${code}: only ${guesses.size} guesses, source list looks wrong`);
  if (answers.size < 200) throw new Error(`${code}: only ${answers.size} answers, filter is too aggressive`);
  for (const a of answers) {
    if (!guesses.has(a)) throw new Error(`${code}: answer ${a} is not an accepted guess`);
  }
  const g = writeList(path.join(outDir, `${code}-guesses.txt`), guesses);
  const a = writeList(path.join(outDir, `${code}-answers.txt`), answers);
  summary.push({ language: code, guesses: g, answers: a, curatedSeed: curatedCount ?? 'n/a' });
}

// A note so nobody wonders where these files came from.
writeFileSync(
  path.join(outDir, 'README.md'),
  `# Word Race dictionaries

Generated by \`scripts/build-wordrace-dict.mjs\` — do not edit by hand.
Regenerate with \`npm run build:dict\`.

Each \`<lang>-guesses.txt\` holds every accepted guess; \`<lang>-answers.txt\` holds
the subset that can be a secret answer. One uppercase five-letter word per line,
accents folded to A-Z.

Sources (both MIT licensed, devDependencies only — not needed at runtime):

- English: [an-array-of-english-words](https://www.npmjs.com/package/an-array-of-english-words)
- French: [an-array-of-french-words](https://www.npmjs.com/package/an-array-of-french-words)
`,
  'utf8',
);

console.table(summary);
if (!existsSync(path.join(outDir, 'en-guesses.txt'))) throw new Error('generation failed');
console.log('wrote dictionaries to shared/wordrace/dict/');
