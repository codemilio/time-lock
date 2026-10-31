/**
 * Contagem regressiva até a revelação (`UI-20`).
 *
 * Atualiza a cada segundo e anuncia o estado "pronta" quando a data chega.
 */

import { useEffect, useState } from "react";

import { formatRemaining, nowMs } from "../lib/dates";

interface CountdownProps {
  target: string;
}

export default function Countdown({ target }: CountdownProps) {
  const [now, setNow] = useState(nowMs);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(nowMs()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const targetTime = new Date(target).getTime();

  if (Number.isNaN(targetTime)) {
    return <span className="text-xs text-ink-muted">Data indisponível</span>;
  }

  return (
    <time dateTime={target} className="text-xs tabular-nums text-ink-muted">
      {formatRemaining(targetTime - now)}
    </time>
  );
}
