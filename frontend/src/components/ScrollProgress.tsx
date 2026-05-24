import { motion, useMotionValueEvent, useScroll, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { Verticale } from '@/lib/api';
import { VERTICALE_META } from '@/lib/verticali';

interface ScrollProgressProps {
  verticale: Verticale | null;
  /** When true the bar is hidden (no article being read). */
  hidden?: boolean;
}

export function ScrollProgress({ verticale, hidden }: ScrollProgressProps) {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const [progress, setProgress] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (v) => setProgress(v));

  if (hidden || verticale == null) return null;

  const tint = `var(${VERTICALE_META[verticale].colorVar})`;

  return (
    <motion.div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[3px] origin-left"
      style={{
        background: tint,
        zIndex: 50,
        scaleX: progress,
        transition: reduceMotion ? undefined : 'transform 80ms linear',
      }}
    />
  );
}
