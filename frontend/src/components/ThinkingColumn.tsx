import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Verticale } from '@/lib/api';
import { VERTICALE_META } from '@/lib/verticali';
import { Primitive, VERTICALE_PRIMITIVE } from '@/components/primitives';

interface ThinkingColumnProps {
  question: string;
  /** Optional verticale hint while we wait — drives which primitive glows. */
  verticale?: Verticale | null;
}

interface Phase {
  label: string;
  /** ms boundary (cumulative from t=0). The last phase loops past its boundary. */
  until: number;
}

const PHASES: readonly Phase[] = [
  { label: 'CONSULTING THE ARCHIVE…', until: 600 },
  { label: 'DRAFTING ANSWER…', until: 1500 },
  { label: 'CITING SOURCES…', until: Infinity },
] as const;

const PRIMITIVES = ['circle', 'triangle', 'square', 'bar'] as const;

export function ThinkingColumn({ question, verticale }: ThinkingColumnProps) {
  const reduceMotion = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [primitiveIdx, setPrimitiveIdx] = useState(0);

  // Drive elapsed-ms tick (50 ms resolution is plenty for phase boundaries).
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - start), 50);
    return () => window.clearInterval(id);
  }, []);

  // Rotate the glowing primitive every 250 ms.
  useEffect(() => {
    const id = window.setInterval(
      () => setPrimitiveIdx((i) => (i + 1) % PRIMITIVES.length),
      250,
    );
    return () => window.clearInterval(id);
  }, []);

  const phaseIdx = PHASES.findIndex((p) => elapsed < p.until);
  const phase = PHASES[phaseIdx === -1 ? PHASES.length - 1 : phaseIdx];

  const glowTint =
    verticale != null
      ? `var(${VERTICALE_META[verticale].colorVar})`
      : 'var(--bauhaus-red)';

  return (
    <article
      aria-busy="true"
      aria-live="polite"
      className="mx-auto max-w-[40rem] px-5 py-7 md:px-8 md:py-10"
    >
      <header className="mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Yellow loader block + rotating square. */}
          <motion.div
            className="relative w-[36px] h-[36px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--bauhaus-yellow)' }}
            initial={reduceMotion ? false : { x: -28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            <motion.svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={
                reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'linear' }
              }
            >
              <rect x="3" y="3" width="14" height="14" fill="var(--off-black)" />
            </motion.svg>
          </motion.div>

          {/* Phase label, fades in/out on swap. */}
          <AnimatePresence mode="wait">
            <motion.span
              key={phase.label}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="eyebrow"
              style={{ color: 'var(--off-black)' }}
            >
              {phase.label}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Primitive sequence: one glows in the verticale tint. */}
        <div
          className="flex items-center gap-2 mt-3"
          aria-hidden="true"
        >
          {PRIMITIVES.map((kind, i) => {
            const active = i === primitiveIdx;
            return (
              <motion.span
                key={kind}
                animate={
                  reduceMotion
                    ? undefined
                    : { scale: active ? 1.15 : 1, opacity: active ? 1 : 0.32 }
                }
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="inline-flex"
              >
                <Primitive
                  kind={kind}
                  size={14}
                  fill={active ? glowTint : 'var(--off-black)'}
                />
              </motion.span>
            );
          })}
        </div>

        <h2
          className="font-sans font-bold mt-5 leading-snug text-[1.2rem] md:text-[1.35rem]"
          style={{ color: 'var(--off-black)' }}
        >
          {question}
        </h2>
      </header>

      <div className="space-y-3">
        {[0.92, 0.88, 0.95, 0.78, 0.9, 0.6].map((w, i) => (
          <ShimmerBar key={i} width={w} delay={i * 0.08} reduceMotion={!!reduceMotion} />
        ))}
      </div>

      <footer
        className="mt-9 pt-5 border-t-[2px]"
        style={{ borderColor: 'var(--off-black)' }}
      >
        <p className="eyebrow mb-3 inline-flex items-center gap-2">
          {verticale != null && (
            <Primitive
              kind={VERTICALE_PRIMITIVE[verticale]}
              size={10}
              fill={glowTint}
            />
          )}
          SOURCES
        </p>
        <div className="space-y-2">
          <ShimmerBar width={0.7} delay={0.4} reduceMotion={!!reduceMotion} />
          <ShimmerBar width={0.55} delay={0.48} reduceMotion={!!reduceMotion} />
        </div>
      </footer>
    </article>
  );
}

function ShimmerBar({
  width,
  delay,
  reduceMotion,
}: {
  width: number;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className="h-3 origin-left"
      style={{ width: `${Math.round(width * 100)}%`, background: 'var(--muted)' }}
      initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    />
  );
}
