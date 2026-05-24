import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { VERTICALI, VERTICALE_META } from '@/lib/verticali';
import type { Verticale } from '@/lib/api';
import { Primitive, VERTICALE_PRIMITIVE } from '@/components/primitives';

interface IssueGridProps {
  onPick: (question: string, suggested?: Verticale) => void;
}

export function IssueGrid({ onPick }: IssueGridProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="issue-grid-title"
      className="mx-auto max-w-6xl px-5 py-7 md:px-10 md:py-10"
    >
      <h2 id="issue-grid-title" className="sr-only">
        In this issue
      </h2>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 mb-6"
      >
        <span className="eyebrow">IN THIS ISSUE</span>
        <div className="flex-1 h-[2px]" style={{ background: 'var(--off-black)' }} />
      </motion.div>

      <div
        className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-0 border-l-[3px] border-t-[3px]"
        style={{ borderColor: 'var(--off-black)', perspective: '1200px' }}
      >
        {VERTICALI.map((v, idx) => (
          <Plate
            key={v}
            verticale={v}
            onPick={onPick}
            ordinal={idx}
            reduceMotion={!!reduceMotion}
          />
        ))}
      </div>
    </section>
  );
}

interface PlateProps {
  verticale: Verticale;
  onPick: (question: string, suggested?: Verticale) => void;
  ordinal: number;
  reduceMotion: boolean;
}

function Plate({ verticale, onPick, ordinal, reduceMotion }: PlateProps) {
  const meta = VERTICALE_META[verticale];
  const tint = `var(${meta.colorVar})`;
  const primitiveKind = VERTICALE_PRIMITIVE[verticale];
  const isLight = verticale === 'life_on_campus';
  const inverseInk = isLight ? 'var(--off-black)' : 'var(--cream)';
  const [hovered, setHovered] = useState(false);

  return (
    <motion.article
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={-1}
      className="relative min-w-0 border-r-[3px] border-b-[3px] overflow-hidden bg-cream"
      style={{
        borderColor: 'var(--off-black)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={
        reduceMotion
          ? undefined
          : { rotateY: 2, rotateX: -1, translateZ: 20 }
      }
      transition={{
        duration: 0.45,
        delay: ordinal * 0.08,
        ease: 'easeOut',
        rotateY: { type: 'spring', stiffness: 320, damping: 22 },
        rotateX: { type: 'spring', stiffness: 320, damping: 22 },
        translateZ: { type: 'spring', stiffness: 320, damping: 22 },
      }}
    >
      {/* Primitive-color entrance sweep — a horizontal wash of the plate's
          tint flashes across the card the first time it scrolls into view,
          then unmounts. Reads as "this section is being *opened*". */}
      {!reduceMotion && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 origin-left pointer-events-none"
          style={{ background: tint, mixBlendMode: 'multiply', opacity: 0.55 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: [0, 1, 0] }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{
            duration: 0.85,
            delay: 0.05 + ordinal * 0.08,
            ease: [0.16, 1, 0.3, 1],
            times: [0, 0.42, 1],
          }}
        />
      )}
      {/* Color flood — clipped from the primitive corner outward on hover. */}
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ scaleX: hovered && !reduceMotion ? 1 : 0 }}
        transition={{ duration: 0.42, ease: [0.22, 0.61, 0.36, 1] }}
        className="absolute inset-0 origin-left"
        style={{ background: tint }}
      />

      {/* Massive Roman numeral background. Cropped at the right edge intentionally. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-[8%] top-[-12%] font-display select-none leading-none"
        style={{
          fontSize: 'clamp(7rem, 18vw, 18rem)',
          color: hovered ? inverseInk : tint,
          transition: 'color 240ms ease',
          mixBlendMode: 'normal',
          opacity: hovered ? 1 : 0.85,
        }}
      >
        {meta.numeral}
      </span>

      <div className="relative p-6 md:p-8 flex flex-col gap-5">
        {/* Sigil row */}
        <div className="flex items-center justify-between gap-3">
          <motion.div
            animate={
              reduceMotion
                ? undefined
                : { scale: hovered ? 1.18 : 1, rotate: hovered ? 8 : 0 }
            }
            transition={{ type: 'spring', stiffness: 280, damping: 16 }}
            className="shrink-0"
          >
            <Primitive
              kind={primitiveKind}
              size={28}
              fill={hovered ? inverseInk : tint}
              style={{ transition: 'fill 240ms ease' }}
            />
          </motion.div>
          <span
            className="eyebrow"
            style={{
              color: hovered ? inverseInk : 'var(--off-black)',
              transition: 'color 240ms ease',
            }}
          >
            {meta.eyebrow}
          </span>
        </div>

        <div>
          <h3
            className="font-display text-[2.1rem] md:text-[2.6rem] leading-[0.9] tracking-[-0.01em]"
            style={{
              color: hovered ? inverseInk : 'var(--off-black)',
              transition: 'color 240ms ease',
            }}
          >
            {meta.label}
          </h3>
          <p
            className="mt-3 max-w-prose text-[0.95rem] font-sans leading-snug"
            style={{
              color: hovered ? inverseInk : 'var(--off-black)',
              transition: 'color 240ms ease',
            }}
          >
            {meta.lead}
          </p>
        </div>

        <ul className="mt-1 space-y-2">
          {meta.sampleQuestions.map((q) => (
            <li key={q}>
              <ChipButton
                label={q}
                tint={tint}
                inverseInk={inverseInk}
                onClick={() => onPick(q, verticale)}
              />
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

function ChipButton({
  label,
  tint,
  inverseInk,
  onClick,
}: {
  label: string;
  tint: string;
  inverseInk: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="group/chip text-left text-[0.94rem] leading-snug w-full px-3 py-3 min-h-[48px] border-2 font-sans flex items-center focus-visible:outline-none focus-visible:ring-0"
      style={{
        background: hovered ? tint : 'var(--cream)',
        color: hovered ? inverseInk : 'var(--off-black)',
        borderColor: 'var(--off-black)',
        transition: 'background-color 200ms ease, color 200ms ease',
      }}
    >
      <motion.span
        animate={{ x: hovered ? 2 : 0, rotate: hovered ? 90 : 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
        className="font-mono mr-2 inline-flex items-center shrink-0"
        style={{
          color: hovered ? inverseInk : 'var(--bauhaus-red)',
          transition: 'color 200ms ease',
        }}
      >
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <polygon points="2,1 11,6 2,11" fill="currentColor" />
        </svg>
      </motion.span>
      <span className="break-words hyphens-auto">{label}</span>
    </motion.button>
  );
}
