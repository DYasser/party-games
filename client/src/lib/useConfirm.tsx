import { useCallback, useState, type ReactNode } from 'react';
import Modal from './Modal';

interface Request {
  message: ReactNode;
  title: string;
  confirmLabel: string;
  /** Red confirm button, for anything destructive. */
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * An in-page replacement for the browser's `confirm`.
 *
 * Returns an `ask` function that resolves to true or false, plus the dialog to
 * render. Unlike the native prompt this is themed, stays inside the page, and
 * does not block the socket connection while it is open.
 *
 *   const { ask, dialog } = useConfirm();
 *   ...
 *   if (await ask('Abandon this game?')) reset();
 *   ...
 *   return <>{dialog}...</>;
 */
export function useConfirm() {
  const [request, setRequest] = useState<Request | null>(null);

  const ask = useCallback((message: ReactNode, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setRequest({
        message,
        title: options.title ?? 'Are you sure?',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        danger: options.danger ?? true,
        resolve,
      });
    });
  }, []);

  const settle = useCallback(
    (ok: boolean) => {
      request?.resolve(ok);
      setRequest(null);
    },
    [request],
  );

  const dialog = request ? (
    <Modal
      title={request.title}
      onClose={() => settle(false)}
      footer={
        <>
          <button className="btn" onClick={() => settle(false)}>
            Cancel
          </button>
          <button
            className={`btn ${request.danger ? 'danger' : 'primary'}`}
            onClick={() => settle(true)}
            autoFocus
          >
            {request.confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal-message">{request.message}</p>
    </Modal>
  ) : null;

  return { ask, dialog };
}
