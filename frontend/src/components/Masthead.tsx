import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { Verticale } from '@/lib/api';
import { VERTICALE_META } from '@/lib/verticali';
import { Primitive, VERTICALE_PRIMITIVE } from '@/components/primitives';
import { DUR, EASE } from '@/lib/motion-tokens';

interface MastheadProps {
  issue: number;
  date: string;
  thinking?: boolean;
  highlightVerticale?: Verticale | null;
  articleCount?: number;
}

export function Masthead({
  issue,
  date,
  thinking = false,
  highlightVerticale,
  articleCount = 0,
}: MastheadProps) {
  const reduceMotion = useReducedMotion();

  const accentColor =
    highlightVerticale != null
      ? `var(${VERTICALE_META[highlightVerticale].colorVar})`
      : 'var(--bauhaus-red)';

  // Single-shot orchestration (1000ms total).
  const enter = reduceMotion
    ? { duration: 0 }
    : { duration: 0.5, ease: EASE.out };

  // Scroll-driven hue tilt on the yellow color block — barely-perceptible
  // skew + tonal shift as the page scrolls. Returns to rest at scrollY=0.
  const { scrollY } = useScroll();
  const blockSkew = useTransform(scrollY, [0, 320], [0, -2.2]);
  const blockY = useTransform(scrollY, [0, 320], [0, -10]);

  return (
    <header
      className="border-b-[3px] bg-cream relative overflow-hidden"
      style={{ borderColor: 'var(--off-black)' }}
    >
      {/* Asymmetric color block "CODEX" — sits behind the title and bleeds into the right margin.
          Two motion stages: (1) entrance slide-in, (2) gentle scroll-driven skew/y-shift on top. */}
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { x: '110%' }}
        animate={{ x: 0 }}
        transition={{ ...enter, delay: reduceMotion ? 0 : 0.05 }}
        className="absolute right-[-4%] top-[18%] hidden md:block w-[42%] h-[64%] -z-0"
        style={{
          background: 'var(--bauhaus-yellow)',
          transformOrigin: 'top right',
          skewY: reduceMotion ? 0 : blockSkew,
          y: reduceMotion ? 0 : blockY,
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pt-5 pb-5 md:px-10 md:pt-7 md:pb-8">
        {/* Top mono ribbon — pared down: issue + date only. Live clock moved
            to the footer (less in-your-face), right-side flavour eyebrow gone. */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...enter, delay: reduceMotion ? 0 : 0 }}
          className="flex items-center justify-between gap-2 flex-wrap"
        >
          <span className="eyebrow whitespace-nowrap inline-flex items-center gap-2">
            <span
              className="inline-block w-2 h-2"
              aria-hidden="true"
              style={{ background: 'var(--off-black)' }}
            />
            ISSUE {issue.toString().padStart(2, '0')}
          </span>
          <span className="eyebrow whitespace-nowrap tabular-nums">{date}</span>
        </motion.div>

        {/* Massive title row. BOCCONI in off-black, CODEX inside a red block.
            On click the whole wordmark presses into the page (letterpress feel).
            Persistent micro-breath: 0.6% scale, 4 s cycle — almost-imperceptible
            type respiration that gives the wordmark presence without flash. */}
        <motion.div
          className="mt-5 md:mt-7 flex items-end gap-3 flex-wrap cursor-pointer select-none"
          animate={
            reduceMotion ? undefined : { scale: [1, 1.006, 1] }
          }
          transition={
            reduceMotion
              ? undefined
              : {
                  duration: DUR.breath,
                  ease: EASE.inOut,
                  repeat: Infinity,
                  repeatType: 'loop',
                }
          }
          whileTap={
            reduceMotion ? undefined : { scale: 0.995, y: 2, filter: 'brightness(0.94)' }
          }
          role="button"
          tabIndex={0}
          aria-label="The Bocconi Codex"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
          }}
        >
          <motion.h1
            className="font-display leading-[0.85] tracking-[-0.02em] text-[clamp(2.4rem,15vw,8.5rem)]"
            style={{ color: 'var(--off-black)' }}
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={{
              hidden: {
                clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)',
              },
              visible: {
                clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
                transition: { ...enter, delay: reduceMotion ? 0 : 0.18, duration: 0.7 },
              },
            }}
          >
            BOCCONI
          </motion.h1>

          <motion.h1
            className="font-display leading-[0.85] tracking-[-0.02em] text-[clamp(2.4rem,15vw,8.5rem)] px-3 py-1 md:px-4 md:py-2"
            style={{
              color: 'var(--cream)',
              background: accentColor,
              transition: 'background-color 280ms ease',
            }}
            initial={reduceMotion ? false : { y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...enter, delay: reduceMotion ? 0 : 0.42, duration: 0.55 }}
          >
            CODEX
          </motion.h1>
        </motion.div>

        {/* Beatrice byline + status line */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enter, delay: reduceMotion ? 0 : 0.62 }}
          className="mt-5 md:mt-7 flex items-baseline gap-3 flex-wrap"
        >
          <span className="eyebrow">WITH</span>
          <span
            className="font-sans font-bold text-[1.4rem] md:text-[1.7rem] leading-none"
            style={{ color: 'var(--off-black)' }}
          >
            Beatrice
          </span>
          {thinking && (
            <span
              className="ink-pulse inline-block w-3 h-3 ml-2"
              aria-hidden="true"
              style={{ background: 'var(--bauhaus-red)' }}
            />
          )}
          {highlightVerticale != null && (
            <span className="eyebrow ml-auto inline-flex items-center gap-2">
              <Primitive
                kind={VERTICALE_PRIMITIVE[highlightVerticale]}
                size={10}
                fill={accentColor}
              />
              <span className="hidden sm:inline">
                READING IN {VERTICALE_META[highlightVerticale].label.toUpperCase()}
              </span>
              <span className="sm:hidden">
                {VERTICALE_META[highlightVerticale].label.toUpperCase()}
              </span>
            </span>
          )}
        </motion.div>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enter, delay: reduceMotion ? 0 : 0.72 }}
          className="mt-3 max-w-prose text-[0.95rem] md:text-base font-sans leading-snug"
          style={{ color: 'var(--off-black)' }}
        >
          A reading-room buddy for Bocconi students.
          {articleCount > 0 && (
            <span className="font-mono uppercase tracking-[0.14em] text-[0.7rem] ml-2" style={{ color: 'var(--off-black)' }}>
              · {articleCount} ARTICLE{articleCount === 1 ? '' : 'S'}
            </span>
          )}
        </motion.p>
      </div>
    </header>
  );
}
