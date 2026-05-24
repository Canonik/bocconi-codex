import { useEffect, useState } from 'react';

function format(d: Date): string {
  // Per-minute resolution — full HH:MM:SS would tick every second and
  // pull attention away from the answer column. The minute tick is
  // enough to convey "this is live" without being a metronome.
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface LiveClockProps {
  /** IANA tz; default = local. Display label appended after the time. */
  tzLabel?: string;
  className?: string;
}

export function LiveClock({ tzLabel = 'CEST', className = '' }: LiveClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick every minute, aligned to the next round minute boundary.
    const ms = new Date().getSeconds();
    const firstDelay = (60 - ms) * 1000;
    const start = window.setTimeout(() => {
      setNow(new Date());
      const id = window.setInterval(() => setNow(new Date()), 60_000);
      return () => window.clearInterval(id);
    }, firstDelay);
    return () => window.clearTimeout(start);
  }, []);

  return (
    <span
      className={`font-mono tabular-nums uppercase tracking-[0.18em] text-[0.66rem] ${className}`}
      aria-live="off"
    >
      <span className="cursor-blink mr-1.5" style={{ color: 'var(--bauhaus-red)' }}>●</span>
      {format(now)} {tzLabel}
    </span>
  );
}
