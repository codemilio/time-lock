/**
 * Banner in-app de cápsulas reveladas (`UI-26`, `NOTIF-04`).
 *
 * Usa `role="status"` para ser anunciado por leitores de tela e oferece a
 * navegação direta para a lista de reveladas.
 */

import { useNavigate } from "react-router-dom";

import { revealedNotificationText } from "../lib/messages";

interface NotificationBannerProps {
  count: number;
  onDismiss?: () => void;
}

export default function NotificationBanner({ count, onDismiss }: NotificationBannerProps) {
  const navigate = useNavigate();

  if (count <= 0) {
    return null;
  }

  function viewRevealed() {
    onDismiss?.();
    navigate("/reveladas");
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-strong"
    >
      <p className="flex items-center gap-2">
        <span aria-hidden="true">✨</span>
        {revealedNotificationText(count)}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={viewRevealed}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-accent-strong"
        >
          Ver reveladas
        </button>

        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
}
