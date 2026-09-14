import { UserError } from '../errors.js';
import type { BasePlayer } from '../room.js';
import {
  DEFAULT_DICE_PER_PLAYER,
  MAX_DICE_PER_PLAYER,
  MIN_DICE_PER_PLAYER,
  MIN_PLAYERS,
  REVEAL_MS,
  TURN_SECONDS,
  type Bid,
  type BluffDiceParticipant,
  type BluffDiceSettings,
  type BluffDiceState,
  type BluffDiceView,
  type RevealResult,
} from './types.js';

export type Rng = () => number;

export class BluffDiceError extends UserError {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BluffDiceError(message);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function rollDice(count: number, rng: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(1 + Math.floor(rng() * 6));
  return out;
}

/** Lowest face a bid may name. */
export function minFace(settings: BluffDiceSettings): number {
  return settings.onesWild ? 2 : 1;
}

/** Dice showing `face`, plus wild 1s when enabled (and the face is not 1 itself). */
export function countMatching(dice: readonly number[], face: number, onesWild: boolean): number {
  let n = 0;
  for (const d of dice) if (d === face || (onesWild && face !== 1 && d === 1)) n++;
  return n;
}

export function totalDice(state: BluffDiceState): number {
  let n = 0;
  for (const p of Object.values(state.players)) n += p.diceCount;
  return n;
}

/** Ids of players still holding dice, in seat order. */
export function activeIds(state: BluffDiceState): string[] {
  return state.seatOrder.filter((id) => (state.players[id]?.diceCount ?? 0) > 0);
}

/** The next player clockwise from `fromId` who still holds dice (never `fromId` itself unless alone). */
export function nextActiveAfter(state: BluffDiceState, fromId: string): string | null {
  const order = state.seatOrder;
  const start = order.indexOf(fromId);
  if (start === -1) return activeIds(state)[0] ?? null;
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step) % order.length];
    if (state.players[id].diceCount > 0) return id;
  }
  return null;
}

/**
 * Why a bid of `quantity` × `face` would be illegal right now, or null if it is fine.
 * A raise needs a higher quantity, or the same quantity and a higher face.
 */
export function raiseProblem(
  current: Bid | null,
  quantity: number,
  face: number,
  settings: BluffDiceSettings,
  total: number,
): string | null {
  if (!Number.isInteger(quantity) || !Number.isInteger(face)) return 'Bid must be whole numbers.';
  if (face < minFace(settings) || face > 6) {
    return settings.onesWild ? 'Ones are wild: bid on faces 2 to 6.' : 'Pick a face from 1 to 6.';
  }
  if (quantity < 1) return 'Bid at least one die.';
  if (quantity > total) return `There are only ${total} dice on the table.`;
  if (!current) return null;
  if (quantity > current.quantity) return null;
  if (quantity === current.quantity && face > current.face) return null;
  return `You must raise: more than ${current.quantity} dice, or ${current.quantity} of a higher face.`;
}

export function isLegalRaise(
  current: Bid | null,
  quantity: number,
  face: number,
  settings: BluffDiceSettings,
  total: number,
): boolean {
  return raiseProblem(current, quantity, face, settings, total) === null;
}

/** The smallest legal raise over `current`, or null when the bid cannot be raised any further. */
export function minimumRaise(
  current: Bid | null,
  settings: BluffDiceSettings,
  total: number,
): { quantity: number; face: number } | null {
  const low = minFace(settings);
  if (!current) return total >= 1 ? { quantity: 1, face: low } : null;
  if (current.face < 6) return { quantity: current.quantity, face: current.face + 1 };
  if (current.quantity < total) return { quantity: current.quantity + 1, face: low };
  return null;
}

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

export function initialState(): BluffDiceState {
  return {
    phase: 'lobby',
    settings: { dicePerPlayer: DEFAULT_DICE_PER_PLAYER, onesWild: true },
    seatOrder: [],
    players: {},
    round: 0,
    currentPlayerId: null,
    bid: null,
    turnEndsAt: null,
    revealEndsAt: null,
    lastResult: null,
    eliminationOrder: [],
    winnerId: null,
  };
}

export function setSettings(state: BluffDiceState, settings: Partial<BluffDiceSettings>): BluffDiceState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'Settings can only change between games.');
  const dicePerPlayer = settings.dicePerPlayer ?? state.settings.dicePerPlayer;
  const onesWild = settings.onesWild ?? state.settings.onesWild;
  assert(
    Number.isInteger(dicePerPlayer) && dicePerPlayer >= MIN_DICE_PER_PLAYER && dicePerPlayer <= MAX_DICE_PER_PLAYER,
    `Dice per player must be between ${MIN_DICE_PER_PLAYER} and ${MAX_DICE_PER_PLAYER}.`,
  );
  assert(typeof onesWild === 'boolean', 'Invalid wild setting.');
  return { ...state, settings: { dicePerPlayer, onesWild } };
}

/** Deal dice to every participant and pick a random opening bidder. */
export function startGame(state: BluffDiceState, participants: BasePlayer[], now: number, rng: Rng = Math.random): BluffDiceState {
  assert(state.phase === 'lobby' || state.phase === 'ended', 'A game is already in progress.');
  assert(participants.length >= MIN_PLAYERS, `Bluff Dice needs at least ${MIN_PLAYERS} players.`);

  const players: Record<string, BluffDiceParticipant> = {};
  const seatOrder = participants.map((p) => p.id);
  for (const id of seatOrder) {
    players[id] = { id, diceCount: state.settings.dicePerPlayer, dice: rollDice(state.settings.dicePerPlayer, rng), left: false };
  }
  const starter = seatOrder[Math.floor(rng() * seatOrder.length)];

  return {
    ...state,
    phase: 'bidding',
    seatOrder,
    players,
    round: 1,
    currentPlayerId: starter,
    bid: null,
    turnEndsAt: now + TURN_SECONDS * 1000,
    revealEndsAt: null,
    lastResult: null,
    eliminationOrder: [],
    winnerId: null,
  };
}

function requireTurn(state: BluffDiceState, playerId: string): void {
  assert(state.phase === 'bidding', 'Nobody is bidding right now.');
  assert(playerId in state.players, 'You are not in this game.');
  assert(state.players[playerId].diceCount > 0, 'You are out of dice.');
  assert(state.currentPlayerId === playerId, 'It is not your turn.');
}

export function placeBid(state: BluffDiceState, playerId: string, quantity: number, face: number, now: number): BluffDiceState {
  requireTurn(state, playerId);
  const problem = raiseProblem(state.bid, quantity, face, state.settings, totalDice(state));
  assert(problem === null, problem ?? 'Illegal bid.');
  const next = nextActiveAfter(state, playerId);
  return {
    ...state,
    bid: { quantity, face, bidderId: playerId },
    currentPlayerId: next,
    turnEndsAt: now + TURN_SECONDS * 1000,
  };
}

/** "Liar!" — reveal every die and settle the current bid. */
export function challenge(state: BluffDiceState, playerId: string, now: number): BluffDiceState {
  requireTurn(state, playerId);
  const bid = state.bid;
  assert(bid, 'There is no bid to challenge yet.');

  let actual = 0;
  for (const p of Object.values(state.players)) actual += countMatching(p.dice, bid.face, state.settings.onesWild);
  const bidStood = actual >= bid.quantity;

  const candidate = bidStood ? playerId : bid.bidderId;
  const loser = state.players[candidate];
  const loserId = loser && !loser.left && loser.diceCount > 0 ? candidate : null;

  const players = { ...state.players };
  let eliminatedId: string | null = null;
  const eliminationOrder = state.eliminationOrder.slice();
  if (loserId) {
    // The roll stays on show for the reveal; the die disappears when the next round is dealt.
    const remaining = players[loserId].diceCount - 1;
    players[loserId] = { ...players[loserId], diceCount: remaining };
    if (remaining === 0) {
      eliminatedId = loserId;
      eliminationOrder.push(loserId);
    }
  }

  const lastResult: RevealResult = { bid, challengerId: playerId, actual, bidStood, loserId, eliminatedId };
  return {
    ...state,
    phase: 'reveal',
    players,
    eliminationOrder,
    lastResult,
    currentPlayerId: null,
    turnEndsAt: null,
    revealEndsAt: now + REVEAL_MS,
  };
}

export function isRevealOver(state: BluffDiceState, now: number): boolean {
  return state.phase === 'reveal' && state.revealEndsAt !== null && now >= state.revealEndsAt;
}

/**
 * Leave the reveal: either the next round starts (the last loser opens, or the
 * next player clockwise from them) or, with one player left, the game ends.
 */
export function nextRound(state: BluffDiceState, now: number, rng: Rng = Math.random): BluffDiceState {
  assert(state.phase === 'reveal', 'There is no reveal to continue from.');
  const active = activeIds(state);
  if (active.length <= 1) return finish(state, active[0] ?? null);

  const result = state.lastResult;
  // The side that lost the challenge opens next, even if they have since left (then the seat after them does).
  const pivot = result ? (result.bidStood ? result.challengerId : result.bid.bidderId) : state.seatOrder[0];
  const starter = state.players[pivot]?.diceCount > 0 ? pivot : nextActiveAfter(state, pivot);

  const players: Record<string, BluffDiceParticipant> = {};
  for (const p of Object.values(state.players)) players[p.id] = { ...p, dice: rollDice(p.diceCount, rng) };

  return {
    ...state,
    phase: 'bidding',
    players,
    round: state.round + 1,
    currentPlayerId: starter,
    bid: null,
    turnEndsAt: now + TURN_SECONDS * 1000,
    revealEndsAt: null,
  };
}

function finish(state: BluffDiceState, winnerId: string | null): BluffDiceState {
  return {
    ...state,
    phase: 'ended',
    winnerId,
    currentPlayerId: null,
    bid: null,
    turnEndsAt: null,
    revealEndsAt: null,
  };
}

export function isTurnExpired(state: BluffDiceState, now: number): boolean {
  return state.phase === 'bidding' && state.turnEndsAt !== null && now >= state.turnEndsAt && state.currentPlayerId !== null;
}

/**
 * The current player ran out of time. With no bid on the table they open with the
 * smallest bid; otherwise they raise the quantity by one on the same face, or
 * challenge when that is impossible.
 */
export function turnTimeout(state: BluffDiceState, now: number): BluffDiceState {
  if (!isTurnExpired(state, now)) return state;
  const id = state.currentPlayerId!;
  const total = totalDice(state);
  if (!state.bid) return placeBid(state, id, 1, minFace(state.settings), now);
  if (state.bid.quantity + 1 <= total) return placeBid(state, id, state.bid.quantity + 1, state.bid.face, now);
  return challenge(state, id, now);
}

/** A seated player left the room: they forfeit their dice and never take another turn. */
export function removePlayer(state: BluffDiceState, playerId: string, now: number): BluffDiceState {
  const p = state.players[playerId];
  if (!p || state.phase === 'lobby' || state.phase === 'ended') return state;
  if (p.left) return state;

  const players = { ...state.players, [playerId]: { ...p, left: true, diceCount: 0, dice: [] } };
  const eliminationOrder = p.diceCount > 0 ? [...state.eliminationOrder, playerId] : state.eliminationOrder;
  let next: BluffDiceState = { ...state, players, eliminationOrder };

  const active = activeIds(next);
  if (active.length <= 1) return finish(next, active[0] ?? null);

  if (next.phase === 'bidding' && next.currentPlayerId === playerId) {
    next = { ...next, currentPlayerId: nextActiveAfter(next, playerId), turnEndsAt: now + TURN_SECONDS * 1000 };
  }
  return next;
}

/** Back to the lobby, keeping the settings. */
export function reset(state: BluffDiceState): BluffDiceState {
  return { ...initialState(), settings: state.settings };
}

/** Final placing: winner first, then the eliminated in reverse order. */
export function standings(state: BluffDiceState): string[] {
  const out: string[] = [];
  if (state.winnerId) out.push(state.winnerId);
  for (const id of state.seatOrder) {
    if (id !== state.winnerId && state.players[id].diceCount > 0) out.push(id);
  }
  for (let i = state.eliminationOrder.length - 1; i >= 0; i--) out.push(state.eliminationOrder[i]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

export type BotAction = { type: 'bid'; quantity: number; face: number } | { type: 'challenge' };

/**
 * A bot's move on its turn. It estimates how many dice show each face from its own
 * hand plus the odds on everyone else's, calls "liar" on bids well above that, and
 * otherwise raises minimally on the face it holds most of. Now and then it bluffs.
 */
export function botAction(state: BluffDiceState, botId: string, rng: Rng = Math.random): BotAction {
  const me = state.players[botId];
  const { onesWild } = state.settings;
  const total = totalDice(state);
  const unknown = total - me.diceCount;
  const p = onesWild ? 1 / 3 : 1 / 6;
  const expected = (face: number) => countMatching(me.dice, face, onesWild) + unknown * p;
  const low = minFace(state.settings);

  let best = low;
  for (let f = low; f <= 6; f++) if (countMatching(me.dice, f, onesWild) > countMatching(me.dice, best, onesWild)) best = f;

  const bid = state.bid;
  if (bid) {
    const noise = (rng() - 0.5) * 0.8;
    if (bid.quantity > expected(bid.face) + 1.2 + noise) return { type: 'challenge' };
  }

  const legal = (q: number, f: number) => isLegalRaise(bid, q, f, state.settings, total);
  const candidates: Array<[number, number]> = [];
  if (!bid) {
    candidates.push([Math.max(1, countMatching(me.dice, best, onesWild)), best]);
  } else {
    if (rng() < 0.1) candidates.push([bid.quantity + 2, best]);
    candidates.push([bid.quantity, best]);
    candidates.push([bid.quantity + 1, bid.face]);
    candidates.push([bid.quantity + 1, best]);
  }
  for (const [q, f] of candidates) if (legal(q, f)) return { type: 'bid', quantity: q, face: f };
  const min = minimumRaise(bid, state.settings, total);
  if (min) return { type: 'bid', ...min };
  return { type: 'challenge' };
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export function viewFor(state: BluffDiceState, playerId: string, now: number): BluffDiceView {
  const me = state.players[playerId];
  const spectating = state.phase !== 'lobby' && (!me || me.diceCount === 0);
  const allVisible = state.phase === 'reveal' || state.phase === 'ended' || spectating;
  const players: BluffDiceView['players'] = {};
  for (const p of Object.values(state.players)) {
    players[p.id] = { ...p, dice: allVisible || p.id === playerId ? p.dice : null };
  }
  return {
    phase: state.phase,
    settings: state.settings,
    seatOrder: state.seatOrder,
    players,
    round: state.round,
    currentPlayerId: state.currentPlayerId,
    bid: state.bid,
    turnEndsAt: state.turnEndsAt,
    revealEndsAt: state.revealEndsAt,
    lastResult: state.lastResult,
    eliminationOrder: state.eliminationOrder,
    winnerId: state.winnerId,
    totalDice: totalDice(state),
    serverNow: now,
  };
}
