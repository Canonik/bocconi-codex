import { useEffect, useRef, useState } from 'react';

function format(secondsTotal: number): string {
  const hh = Math.floor(secondsTotal / 3600);
  const mm = Math.floor((secondsTotal % 3600) / 60);
  const ss = secondsTotal % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

interface IssueRuntimeProps {
  className?: string;
  label?: string;
}

/**
 * Issue running time — counts up from first paint, second resolution.
 * Editorial detail meant to feel like a press-day ticker. Mute color +
 * tabular-nums so the digits don't jitter horizontally when they tick.
 */
export function IssueRuntime({
  className = '',
  label = 'RUNTIME',
}: IssueRuntimeProps) {
  const start = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - start.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={`font-mono tabular-nums uppercase tracking-[0.16em] text-[0.66rem] inline-flex items-center gap-2 ${className}`}
      style={{ color: 'var(--muted-foreground)' }}
      aria-live="off"
    >
      <span aria-hidden="true">{label}</span>
      <span style={{ color: 'var(--off-black)' }}>{format(seconds)}</span>
    </span>
  );
}
