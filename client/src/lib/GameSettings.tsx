import { useState, type ReactNode } from 'react';
import Modal from './Modal';

interface Props {
  /** The settings fields. Usually NumberFields and checkboxes. */
  children: ReactNode;
  /** Only the host may change anything; everyone else sees them read-only. */
  isHost: boolean;
  /** Disabled with this reason when settings are locked (mid-game). */
  lockedReason?: string;
  /** A short summary shown on the button, e.g. "3 min day · 60s turns". */
  summary?: ReactNode;
}

/**
 * The lobby's settings, behind a button rather than spread down the page.
 *
 * Games accumulated enough options that listing them all in the lobby crowded
 * out the thing that matters there — who is in the room. This keeps one button
 * with a one-line summary, and puts the controls in a dialog.
 */
export default function GameSettings({ children, isHost, lockedReason, summary }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="btn settings-button"
        onClick={() => setOpen(true)}
        disabled={!!lockedReason}
        title={lockedReason ?? 'Game settings'}
      >
        <span className="settings-gear" aria-hidden>
          ⚙
        </span>
        <span className="settings-button-text">
          Game settings
          {summary && <em>{summary}</em>}
        </span>
      </button>

      {open && (
        <Modal
          title="Game settings"
          wide
          onClose={() => setOpen(false)}
          footer={
            <button className="btn primary" onClick={() => setOpen(false)}>
              Done
            </button>
          }
        >
          {!isHost && (
            <p className="modal-note">Only the host can change these. Here is what they picked.</p>
          )}
          <div className="settings-grid">{children}</div>
        </Modal>
      )}
    </>
  );
}
