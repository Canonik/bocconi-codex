import { useEffect, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { Verticale } from '@/lib/api';
import { VERTICALE_META } from '@/lib/verticali';

interface CursorOrbProps {
  verticale: Verticale | null;
  /** When true, the orb does not render (reading an article, thinking, or showing an error). */
  paused?: boolean;
}

export function CursorOrb({ verticale, paused = false }: CursorOrbProps) {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 60, damping: 20, mass: 1.2 });
  const sy = useSpring(y, { stiffness: 60, damping: 20, mass: 1.2 });

  useEffect(() => {
    if (reduceMotion) return;
    if (typeof window === 'undefined') return;

    function update() {
      setEnabled(window.matchMedia('(min-width: 768px)').matches);
    }
    update();
    const mql = window.matchMedia('(min-width: 768px)');
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [reduceMotion]);

  useEffect(() => {
    if (!enabled) return;
    function onMove(e: PointerEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [enabled, x, y]);

  if (!enabled || paused) return null;

  const tint = verticale != null
    ? `var(${VERTICALE_META[verticale].colorVar})`
    : 'var(--bauhaus-red)';

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0"
      style={{
        x: sx,
        y: sy,
        translateX: '-50%',
        translateY: '-50%',
        zIndex: 0,
      }}
    >
      <div
        className="rounded-full"
        style={{
          width: 360,
          height: 360,
          background: tint,
          opacity: 0.04,
          transition: 'background 320ms ease',
        }}
      />
    </motion.div>
  );
}
