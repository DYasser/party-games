# Modals, confirms, and the game settings dialog

Three shared pieces in `client/src/lib/`, styled in `shared-ui.css` (already imported once in `main.tsx`).
**Do not** add per-game CSS for any of them, and do not edit `shared-ui.css` or `styles.css`.

## 1. No native browser dialogs, ever

`window.confirm`, `window.alert` and `window.prompt` render as an operating-system window *outside* the
page. They ignore the theme, cannot be styled, block the whole tab, and on some platforms appear detached
from the game entirely. Every one of them must be replaced.

Use the `useConfirm` hook:

```tsx
import { useConfirm } from '../../lib/useConfirm';

function MyRoom() {
  const { ask, dialog } = useConfirm();

  const reset = async () => {
    if (await ask('Abandon this game and return to the lobby?', {
      title: 'Abandon game?',
      confirmLabel: 'Abandon',
    })) {
      void act((a) => socket.emit('mygame:reset', a));
    }
  };

  return (
    <div className="room">
      {dialog /* renders nothing until something is being asked */}
      ...
    </div>
  );
}
```

- `ask(message, options?)` returns `Promise<boolean>`.
- Options: `title` (default "Are you sure?"), `confirmLabel` (default "Confirm"), `danger` (default `true`,
  which makes the confirm button red). Pass `danger: false` for a harmless confirmation.
- The hook must be called at component top level, and `{dialog}` rendered somewhere in that component's tree.
- If the handler is inside a `.map()` or a child component, lift `ask` in as a prop rather than calling the
  hook per row.

## 2. `Modal` — for anything else that needs a dialog

```tsx
import Modal from '../../lib/Modal';

{open && (
  <Modal title="Locations" onClose={() => setOpen(false)} wide
        footer={<button className="btn primary" onClick={() => setOpen(false)}>Done</button>}>
    ...body...
  </Modal>
)}
```

Handles Escape, backdrop click, focus trapping and restoring focus. `wide` widens the panel for settings.

## 3. `GameSettings` — the lobby's options, behind one button

Lobby settings belong in a dialog, not spread down the page: the lobby's job is showing who is in the room.

```tsx
import GameSettings from '../../lib/GameSettings';
import NumberField from '../../lib/NumberField';

<GameSettings
  isHost={isHost}
  lockedReason={inProgress ? 'Settings are locked once the game starts' : undefined}
  summary={`${minutes} min rounds · ${state.settings.rounds} rounds`}
>
  <NumberField label="Rounds" value={...} min={MIN_ROUNDS} max={MAX_ROUNDS}
               suffix="rounds" disabled={!isHost} onCommit={(n) => onSettings({ rounds: n })} />

  <label className="settings-toggle settings-row-full">
    <input type="checkbox" checked={state.settings.someFlag} disabled={!isHost}
           onChange={(e) => onSettings({ someFlag: e.target.checked })} />
    <span className="settings-toggle-text">
      <strong>A short label</strong>
      <span>One line saying what it changes.</span>
    </span>
  </label>
</GameSettings>
```

Rules:

- Put **every** host-configurable option inside it. Nothing configurable stays inline in the lobby.
- `summary` is a short line shown on the button so the room can see the setup without opening it.
- Always pass `disabled={!isHost}` to the fields; `GameSettings` also shows non-hosts an explanatory note.
- Use `lockedReason` when settings cannot change (mid-game), which disables the button with a tooltip.
- Classes available: `settings-row-full` (span the grid), `settings-toggle` (a checkbox row),
  `settings-section-label` (a small heading between groups).
- Bounds come from the game's own `MIN_*`/`MAX_*` constants in `shared/<game>/types.ts`. Never hard-code.


## 4. `Select` — a themed replacement for `<select>`

A native `<select>`'s dropdown is drawn by the operating system. It ignores the page's fonts and colours, so
it lands as a white system menu in the middle of the dark theme. Use the shared component instead; there
should be no `<select>` elements in `client/src/games/`.

```tsx
import Select from '../../lib/Select';

<Select
  label="Language"                       // accessible name (the trigger is a button)
  value={source.language}
  onChange={(code) => onSettings({ language: code })}
  options={LANGUAGE_CODES.map((code) => ({
    value: code,
    label: LANGUAGES[code].name,
    hint: LANGUAGES[code].nativeName,    // optional second line
  }))}
/>

// `compact` is the narrow variant, for a single number or character:
<Select compact label="Number" value={count} onChange={setCount}
        options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
```

What it handles for you:

- **Keyboard.** Enter/Space/Up/Down open; Up/Down move; Home/End jump; Enter or Space picks; Escape cancels
  and keeps the old value; Tab closes; typing letters jumps to a matching option.
- **Placement.** The list is portalled to `<body>` and positioned against the trigger, so a card's `overflow`
  or `backdrop-filter` cannot clip it. It flips above the trigger near the bottom of the viewport and follows
  the trigger on scroll or resize.
- **One at a time.** Opening a list closes any other open one.
- **Closing.** Outside click, Escape, Tab, or picking an option; focus always returns to the trigger.

Rules:

- `label` is required — it is the accessible name, since the trigger is a `<button>`, not a labelled `<select>`.
- `onChange` receives the typed `value`, not an event. No `e.target.value` parsing.
- Options carry `value`, `label`, optional `hint` and optional `disabled`. Disabled options are skipped by
  keyboard navigation.
- Do not style `.pg-select*` from a game stylesheet. If a game needs a width cap, target
  `.my-wrapper .pg-select` rather than redefining the component.
