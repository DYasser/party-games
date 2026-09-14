import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons along the bottom. */
  footer?: ReactNode;
  /** Wider panel, for settings with several fields. */
  wide?: boolean;
}

/**
 * An in-page modal dialog.
 *
 * Replaces the browser's native `confirm`/`alert`, which render as an OS window
 * outside the page: they break the theme, cannot be styled, block the whole
 * tab, and on some platforms appear detached from the game entirely.
 *
 * Closes on Escape or a click on the backdrop, traps focus while open, and
 * restores focus to whatever opened it.
 *
 * Rendered through a portal onto <body>. This is required, not cosmetic: every
 * `.card` in the app sets `backdrop-filter`, which creates a stacking context,
 * so a dialog rendered inside one is trapped in that card's layer and sibling
 * cards paint straight over it however high its z-index goes. Escaping to the
 * body is the only way the backdrop can cover the whole page.
 */
export default function Modal({ title, onClose, children, footer, wide }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    // Focus the panel so Escape works and screen readers announce the dialog.
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the dialog.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    // Stop the page behind from scrolling while the dialog is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      (previouslyFocused.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal-panel ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        ref={panelRef}
        // A click inside must not fall through to the backdrop.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
