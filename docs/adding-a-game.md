# Adding a game

Every game is a self-contained module: pure rules in `shared/`, a server module that guards who may do what and
drives bots and timers, and a React UI. This guide is the contract. Read the reference implementation first:
**Infiltrator** (`shared/infiltrator/*`, `server/src/games/infiltrator/module.ts`, `client/src/games/infiltrator/*`)
shows timers, per-player hidden information, bots, and a multi-phase UI.

## Files you own

For a game with id `<id>` (lowercase, no separators) and Pascal name `<Pascal>`:

```
shared/<id>/types.ts          State, per-player view, settings, constants
shared/<id>/logic.ts          Pure rule functions; throw `<Pascal>Error extends UserError` on invalid actions
shared/<id>/logic.test.ts     Vitest; cover every phase transition and every rejection path
shared/<id>/events.ts         `export interface <Pascal>Events { '<id>:xxx': (payload, ack?: AckFn) => void }`
shared/<id>/<content>.ts      Word lists, prompts, categories... ORIGINAL content only
server/src/games/<id>/module.ts   `export const <id>Module: GameModule<P, S>`
client/src/games/<id>/<Pascal>Entry.tsx   Create/join page built on `GameEntry` (rules go in its children)
client/src/games/<id>/<Pascal>Room.tsx    The room: lobby + play + results
client/src/games/<id>/*.tsx               Any extra components
client/src/games/<id>/<id>.css            Game-specific styles, imported by the Room. Prefix classes with `<id>-`.
scripts/e2e-<id>.mjs                      Socket-level smoke test (see `scripts/e2e-lib.mjs` and `e2e-bots.mjs`)
```

Already wired for you (do not edit): `shared/room.ts` (GameId, GAME_INFO), `shared/protocol.ts` (extends your
events interface), `server/src/index.ts` (module list), `client/src/App.tsx` (routes `/<id>` and `/<id>/:code`),
`client/src/pages/Home.tsx` (tile), `client/src/styles.css` (theme).

## Shared building blocks

- `shared/room.ts`: `BasePlayer { id, name, connected, isBot? }`, `Room<P, S>`, `RoomView<P, V>`.
- `shared/errors.ts`: `UserError`. Only these messages reach players; anything else logs and becomes "Something went wrong."
- `server/src/games/module.ts`: the `GameModule` interface. `register(socket, ctx)` attaches handlers with
  `ctx.withRoom(ack, (room, player) => { ... })`, which acks, catches `UserError`, and broadcasts. `ctx.requireHost`.
  Optional hooks: `onPlayerRemoved`, `onBotAdded`, `botTick`, `onRoomClosed`.
- `server/src/games/bots.ts`: `BotScheduler(plan)`. Call `scheduler.tick(room, broadcast)` from `botTick`; return
  `{ delayMs, run }` from `plan(room)` or `null`. `rand`, `pick`, `chance` helpers. Bots are ordinary seated players
  with `isBot: true` and `connected: true`; the host adds them with `room:addBot` (generic, already implemented).
- Timers: copy the `syncTimer` pattern from the Infiltrator module. Keep timers in a module-level `Map<code, Timeout>`,
  clear them in `onRoomClosed`, and re-sync after every state change.
- Client: `useRoom<RoomView<P, V>>(code, name)` returns `{ room, game, status, error, closed, toast, act, socket }`.
  `act((ack) => socket.emit('<id>:xxx', payload, ack))` shows server errors as a toast. Redirect if `game && game !== '<id>'`.
  Copy the `NamePrompt`, room-bar (code, copy link, status, host actions incl. `+ Bot` / `Remove bots` in the lobby),
  and toast from `InfiltratorRoom.tsx`.

## Rules of the road

1. **Per-player views.** `view(room, player)` must strip everything that player may not know. Never trust the client.
2. **Pure logic.** Rules live in `shared/<id>/logic.ts` as `(state, ...) => state` functions with `now` passed in,
   so they are testable and deterministic. The server module only checks identity (host, seat) and manages timers.
3. **Solo-playable with bots.** One human host plus bots must be able to play a full game. Bots may "peek" at hidden
   state to act plausibly, but should be fallible. Bots never take over a role a human is actively playing.
4. **Resilient to leavers.** A disconnected player has `connected: false`; a removed player triggers
   `onPlayerRemoved`. The game must never deadlock waiting on someone who is gone: skip them, auto-advance, or end.
5. **Original content.** No existing game names, no copied question banks or word lists, no publisher references.
6. **Theme.** Use the tokens in `client/src/styles.css` (`--panel`, `--border`, `--muted`, `--mint`, `--cyan`,
   `--violet`, `--red`, `--blue`, `--font-display`, `--font-body`) and reuse existing classes: `card`, `btn`
   (`primary`, `small`, `ghost`, `big`), `room`, `room-bar`, `room-code`, `room-status`, `room-actions`, `turn-pill`,
   `player-list`, `player-row`, `player-name`, `tag` (`tag bot`), `score-list`, `banner`, `overlay`, `hint`, `muted`,
   `small-text`, `field`, `toast`, `countdown`. Layouts must collapse to one column under 860px.
7. **Verify.** `npx vitest run shared/<id>`, `npx tsc -p client/tsconfig.json --noEmit`,
   `npx tsc -p server/tsconfig.json --noEmit`, and your e2e script against your own server instance:
   `PORT=<port> npx tsx server/src/index.ts` then `E2E_URL=http://localhost:<port> node scripts/e2e-<id>.mjs`.
   Never point e2e at port 3001 (the developer's live server).

## Generated data files

A game needing a large data set (a dictionary, for instance) should not hand-write it into a `.ts` file.
Instead add a generator under `scripts/`, write the output to `shared/<game>/<dir>/` as plain text, and commit
it. Keep the source packages in `devDependencies` so nothing extra ships at runtime, load the files on the
server (never in the browser bundle), and record the licence in `NOTICE.md`. Word Race is the reference:
`scripts/build-wordrace-dict.mjs` plus `server/src/games/wordrace/dictionaries.ts`.
