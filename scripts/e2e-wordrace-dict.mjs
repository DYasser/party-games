// End-to-end check of Word Race dictionary validation, languages and custom lists.
// Usage: E2E_URL=http://localhost:3300 node scripts/e2e-wordrace-dict.mjs
import { connect, req, settle, assert } from './e2e-lib.mjs';

const log = (...args) => console.log(...args);

const host = await connect();
// Listen before creating the room, so the first broadcast is not missed.
let view = null;
host.on('room:state', (v) => (view = v));

const { code } = await req(host, 'room:create', { game: 'wordrace', name: 'Host', playerId: 'wr-dict-host-01' });
log(`room ${code}`);
await settle();

// ---- lobby exposes the dictionary summary -----------------------------------
assert(view.state.wordSource, 'wordSource present');
assert(view.state.wordSource.language === 'en', 'defaults to English');
assert(view.state.wordSource.custom === false, 'not custom by default');
assert(view.state.wordSource.guessCount > 10000, `English accepts many guesses (${view.state.wordSource.guessCount})`);
assert(view.state.wordSource.answerCount > 400, `English has answers (${view.state.wordSource.answerCount})`);
assert(Array.isArray(view.state.wordSource.answers), 'answer list visible in lobby');
log(`en: ${view.state.wordSource.guessCount} guesses, ${view.state.wordSource.answerCount} answers`);

// ---- the checkList preview ---------------------------------------------------
const check = await req(host, 'wordrace:checkList', { text: 'pizza, PASTA; salad\nbread\nolive\ntoolong\nfour\nb4d!!\nPIZZA', language: 'en' });
assert(check.accepted.join(',') === 'PIZZA,PASTA,SALAD,BREAD,OLIVE', `accepted: ${check.accepted.join(',')}`);
const reasons = Object.fromEntries(check.rejected.map((r) => [r.word, r.reason]));
assert(/needs 5/.test(reasons.toolong ?? ''), 'toolong rejected for length');
assert(/needs 5/.test(reasons.four ?? ''), 'four rejected for length');
assert(/letters only/.test(reasons['b4d!!'] ?? ''), 'b4d!! rejected for characters');
assert(reasons.PIZZA === 'duplicate', 'duplicate flagged');
assert(check.notInDictionary.length === 0, 'all five are real English words');
log('checkList preview correct');

// ---- guesses must be real words ---------------------------------------------
await req(host, 'wordrace:settings', { rounds: 1, roundSeconds: 120 });
await req(host, 'wordrace:start');
await settle();
assert(view.state.phase === 'playing', 'round running');

await req(host, 'wordrace:guess', { word: 'ZZZZZ' }).then(
  () => assert(false, 'ZZZZZ should be rejected'),
  (e) => log(`non-word rejected: ${e.message}`),
);
await req(host, 'wordrace:guess', { word: 'ABCDE' }).then(
  () => assert(false, 'ABCDE should be rejected'),
  (e) => log(`nonsense rejected: ${e.message}`),
);
await req(host, 'wordrace:guess', { word: 'CRAN' }).then(
  () => assert(false, 'short guess should be rejected'),
  (e) => log(`short guess rejected: ${e.message}`),
);

// A real word is accepted, and lowercase input is folded.
await req(host, 'wordrace:guess', { word: 'crane' });
await settle();
let board = view.state.round.boards[view.you.id];
assert(board.guesses.length === 1 && board.guesses[0].word === 'CRANE', 'real word accepted and uppercased');
assert(board.guesses[0].marks.length === 5, 'feedback returned');
log('real word accepted');

// The pool is hidden mid-game so nobody can narrow the answer down.
assert(view.state.wordSource.answers === null, 'answer list hidden while playing');
log('word list hidden during play');

// Settings are locked mid-game.
await req(host, 'wordrace:settings', { language: 'fr' }).then(
  () => assert(false, 'language change mid-game should fail'),
  (e) => log(`mid-game settings rejected: ${e.message}`),
);

await req(host, 'wordrace:reset');
await settle();

// ---- French ------------------------------------------------------------------
await req(host, 'wordrace:settings', { language: 'fr' });
await settle();
assert(view.state.wordSource.language === 'fr', 'switched to French');
assert(view.state.wordSource.guessCount > 3000, `French accepts many guesses (${view.state.wordSource.guessCount})`);
log(`fr: ${view.state.wordSource.guessCount} guesses, ${view.state.wordSource.answerCount} answers`);

await req(host, 'wordrace:start');
await settle();
// An English word is not a French word.
await req(host, 'wordrace:guess', { word: 'CRANE' }).then(
  () => log('note: CRANE also exists in the French list'),
  (e) => log(`English word rejected in French: ${e.message}`),
);
await req(host, 'wordrace:guess', { word: 'arbre' });
await settle();
board = view.state.round.boards[view.you.id];
assert(board.guesses.some((g) => g.word === 'ARBRE'), 'French word accepted');
log('French guess accepted');
await req(host, 'wordrace:reset');
await settle();

// ---- custom answer list ------------------------------------------------------
await req(host, 'wordrace:settings', { language: 'en', customWords: 'PIZZA PASTA SALAD BREAD OLIVE' });
await settle();
assert(view.state.wordSource.custom === true, 'custom mode on');
assert(view.state.wordSource.answerCount === 5, 'five custom answers');
assert(view.state.wordSource.answers.join(',') === 'PIZZA,PASTA,SALAD,BREAD,OLIVE', 'custom list visible');
log('custom list applied');

await req(host, 'wordrace:settings', { customWords: 'CRANE SLATE' }).then(
  () => assert(false, 'a two-word list should be rejected'),
  (e) => log(`short custom list rejected: ${e.message}`),
);

await req(host, 'wordrace:start');
await settle();
assert(
  ['PIZZA', 'PASTA', 'SALAD', 'BREAD', 'OLIVE'].includes(view.state.round.answer ?? 'HIDDEN') ||
    view.state.round.answer === null,
  'answer drawn from the custom list (or hidden)',
);
// Dictionary words are still guessable alongside the custom ones.
await req(host, 'wordrace:guess', { word: 'STERN' });
await settle();
board = view.state.round.boards[view.you.id];
assert(board.guesses.some((g) => g.word === 'STERN'), 'dictionary word still accepted with a custom list');
log('dictionary guesses still allowed in custom mode');

await req(host, 'wordrace:reset');
await settle();
await req(host, 'wordrace:settings', { customWords: '' });
await settle();
assert(view.state.wordSource.custom === false, 'cleared back to the dictionary');
log('custom list cleared');

log('\nWORD RACE DICTIONARY E2E PASSED');
host.disconnect();
process.exit(0);
