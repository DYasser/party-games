# Shared UI: NumberField and Podium

Two shared components, styled in `client/src/lib/shared-ui.css` (imported once in `main.tsx`).
Do not add per-game CSS for either one, and do not edit `shared-ui.css` or `styles.css`.

## NumberField — typed numeric settings

Replaces every `<select>` used for a round count or a duration. The host types a number (or uses the
`−`/`+` steppers); the value is clamped to `[min, max]` and committed on blur, Enter, or a stepper press,
so a half-typed value is never emitted. When `disabled`, it renders as read-only text for non-hosts.

```tsx
import NumberField from '../../lib/NumberField';
import { MAX_ROUNDS, MIN_ROUNDS } from '@shared/<game>/types';

<div className="settings-row">
  <NumberField
    label="Rounds"
    value={state.settings.rounds}
    min={MIN_ROUNDS}
    max={MAX_ROUNDS}
    suffix="rounds"
    disabled={!isHost}
    onCommit={(rounds) => onSettings({ rounds })}
  />
  <NumberField
    label="Round length"
    value={Math.round(state.settings.roundSeconds / 60)}
    min={Math.ceil(MIN_ROUND_SECONDS / 60)}
    max={Math.floor(MAX_ROUND_SECONDS / 60)}
    suffix="min"
    disabled={!isHost}
    onCommit={(min) => onSettings({ roundSeconds: min * 60 })}
  />
</div>
```

Rules:

- **Always import the real MIN/MAX constants** from the game's `shared/<game>/types.ts`. Never hard-code bounds.
- Durations are expressed in **whole minutes** in the UI when the server range divides cleanly into minutes
  (that is, when both bounds are multiples of 60). Otherwise use seconds with `suffix="sec"`.
- Wrap two or more fields in `<div className="settings-row">`.
- Pass `disabled={!isHost}` so non-hosts see the current value.
- Keep any explanatory copy that already sat near the setting.

## Podium — animated end-of-game results

Replaces the flat medal list on the final screen. Top three rise onto pillars (3rd, then 2nd, then 1st),
scores count up, confetti falls, and 4th place downward is listed underneath. Ties share a place.

```tsx
import Podium, { type PodiumEntry } from '../../lib/Podium';

const entries: PodiumEntry[] = players.map((p) => ({
  id: p.id,
  name: p.name,
  score: state.scores[p.id] ?? 0,
  isBot: p.isBot,
  isYou: p.id === you.id,
  detail: <>solved {solvedCount(p.id)}</>, // optional, omit if you have nothing useful
}));

<div className="card">
  <Podium entries={entries} unit="pts">
    <div className="podium-actions">
      {isHost ? (
        <button className="btn primary big" onClick={playAgain}>Play again</button>
      ) : (
        <p className="muted small-text">Waiting for the host to start another game…</p>
      )}
    </div>
  </Podium>
</div>
```

Rules:

- `Podium` does its own sorting and ranking. Pass entries in any order; do not pre-sort or pre-rank.
- `unit` is the score word shown after each number (`"pts"`, `"points"`, `"wins"`). Keep it short.
- Children render between the podium and the runner-up list: put the host's Play again / Back to lobby
  buttons there inside `<div className="podium-actions">`.
- Delete the game's now-unused medal arrays, ranking helpers, and leaderboard CSS classes.
- Keep game-specific extras that are not the ranking itself (a "best answer" callout, a final score-out-of-N
  summary, a revealed answer). Put them in the children, above the actions.
- For a cooperative game with one shared score, a podium makes no sense: skip it (see One Word).

## Celebration layer — the interactive end screen

The results screen is also a playground. `Podium` takes an optional `celebration` prop; pass it and players
can fling emoji at each other and fire confetti that everyone in the room sees. Omit it and the podium
renders exactly as before.

```tsx
import { useCelebration } from '../../lib/useCelebration';

function Ended({ room, socket }: { room: MyRoomView; socket: AppSocket }) {
  const celebration = useCelebration(socket, true); // enabled only on the ended screen
  return (
    <Podium entries={entries} unit="pts" celebration={celebration} extraAwards={myAwards}>
      <div className="podium-actions">{/* Play again, Back to lobby */}</div>
    </Podium>
  );
}
```

What you get for free:

- **Reactions.** Tapping any player opens a tray of ten emoji. Throws are relayed to the whole room, fly
  across every screen toward the target, and accumulate as badges under their name.
- **Superlatives.** `computeAwards` in `shared/awards.ts` derives playful titles from the final scores alone
  (Photo Finish, Landslide, Robot Uprising, Wooden Spoon...), so every podium game gets them.
- **Confetti cannon.** Anyone can fire it; everyone sees the burst, credited by name.

Rules:

- Reactions are **transient and cosmetic**. They are relayed on the room channel, never written to game
  state, and never persisted. A refresh clears them, which is fine.
- The server rate-limits throws per player (`ReactionLimiter`, a rolling window). Throttled throws ack `ok`
  rather than erroring, because an error toast per tap would be worse than a silently dropped emoji.
- `extraAwards` may only use data the ended-phase view actually exposes. Never invent a statistic; if the
  view keeps only the final round, scope the award's wording to that round.
- Under `prefers-reduced-motion` the tallies still update but nothing flies and no confetti drops.

### Games without a podium

`Podium` is wrong for a game that ends on a win for one side (Cipher Grid, Nightfall, Infiltrator) or on a
single shared score (One Word) — there is no ranking to show. Those results screens simply state the outcome
and the scores.

There used to be a shared `ReactionRow` for them — a strip of player name-cards to fling reactions at, plus a
confetti button. It was removed at the user's request: on a results screen it repeated names already shown
above it, and it was the panel labelled "Round debrief" in Infiltrator. Do not reintroduce it without asking.

`Podium` keeps its own built-in reactions and confetti, so the ranked games (Bluff Dice, Letter Rush,
Spectrum, Word Race, Pair Rush) are unaffected.
