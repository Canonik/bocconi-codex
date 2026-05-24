import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { KeyboardEvent, FormEvent } from 'react';

interface ComposerProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const ROTATING_PLACEHOLDERS = [
  'Ask Beatrice anything about Bocconi or Milan…',
  'How do I get a codice fiscale?',
  'Quale documento serve per la biblioteca?',
  "What's the cheapest annual ATM pass?",
  'Which neighborhoods near Bocconi fit €700/month?',
  'Quando scadono le domande di Erasmus?',
] as const;

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
}: ComposerProps) {
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [phIdx, setPhIdx] = useState(0);

  // Rotate the empty-input placeholder every 3 s while idle and unfocused.
  useEffect(() => {
    if (placeholder !== undefined) return; // explicit prop wins
    if (focused || disabled || value.length > 0) return;
    const id = window.setInterval(
      () => setPhIdx((i) => (i + 1) % ROTATING_PLACEHOLDERS.length),
      3000,
    );
    return () => window.clearInterval(id);
  }, [focused, disabled, value.length, placeholder]);

  const activePlaceholder = placeholder ?? ROTATING_PLACEHOLDERS[phIdx];

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim().length > 0) {
        onSubmit();
      }
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!disabled && value.trim().length > 0) onSubmit();
  }

  const canSend = !disabled && value.trim().length > 0;

  // Surface tone shifts a hair warmer when the user focuses the textarea.
  // Within the existing palette: cream → cream-deep (a 2 %-darker cream tint).
  const surface = focused ? 'var(--paper-deep, #EAE4D2)' : 'var(--cream)';

  return (
    <section
      aria-label="Ask the editor"
      className="border-b-[3px]"
      style={{
        borderColor: 'var(--off-black)',
        background: surface,
        transition: 'background 220ms ease',
      }}
    >
      <div className="mx-auto max-w-6xl px-5 py-5 md:px-10 md:py-6">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="eyebrow inline-flex items-center gap-2"
            style={{ color: 'var(--off-black)' }}
          >
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5"
              style={{ background: 'var(--bauhaus-red)' }}
            />
            ASK THE EDITOR
          </span>
          <div
            className="flex-1 h-[2px]"
            style={{ background: 'var(--off-black)' }}
          />
        </div>

        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-0 items-stretch relative"
          onSubmit={handleSubmit}
        >
          <label htmlFor="composer-input" className="sr-only">
            Question for Beatrice
          </label>
          <div className="relative">
            <textarea
              id="composer-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={value.length === 0 && !focused && placeholder === undefined ? '' : activePlaceholder}
              rows={1}
              disabled={disabled}
              className="hairline-input w-full resize-none font-sans text-[1rem] md:text-[1.05rem] leading-snug px-4 py-3 min-h-[3.25rem] focus:border-r-0 disabled:opacity-50 placeholder:text-[color:var(--muted-foreground)] field-sizing-content"
              style={{ borderRight: '0' }}
            />
            {/* Cross-fade overlay placeholder. Hidden once the user focuses or types. */}
            {placeholder === undefined && value.length === 0 && !focused && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={phIdx}
                  aria-hidden="true"
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.32 }}
                  className="pointer-events-none absolute left-4 top-3 font-sans text-[1rem] md:text-[1.05rem] leading-snug truncate"
                  style={{
                    color: 'var(--muted-foreground)',
                    width: 'calc(100% - 2rem)',
                  }}
                >
                  {activePlaceholder}
                </motion.span>
              </AnimatePresence>
            )}
          </div>

          <SendButton
            disabled={!canSend}
            loading={disabled === true}
            ready={canSend}
            reduceMotion={!!reduceMotion}
          />
        </form>

        {/* Trust microcopy — set in Geist Mono, eyebrow weight, three editorial promises. */}
        <p
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.7rem] uppercase tracking-[0.14em]"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5"
              style={{ background: 'var(--bauhaus-red)' }}
            />
            CITES SOURCES
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5"
              style={{ background: 'var(--bauhaus-yellow)' }}
            />
            ABSTAINS WHEN UNSURE
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5"
              style={{ background: 'var(--bauhaus-blue)' }}
            />
            0 WRONG ANSWERS ACROSS PRE-TEST SAMPLES
          </span>
        </p>

        <p className="mt-2 hidden md:flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.72rem] font-mono uppercase tracking-[0.14em]" style={{ color: 'var(--off-black)' }}>
          <span className="inline-flex items-center gap-2">
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <polygon points="2,1 11,6 2,11" fill="currentColor" />
            </svg>
            <span>ENTER TO SEND</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" fill="currentColor" />
            </svg>
            <span>SHIFT + ENTER FOR NEW LINE</span>
          </span>
          {disabled && (
            <span className="inline-flex items-center gap-2 ml-auto" style={{ color: 'var(--bauhaus-red)' }}>
              <span
                className="inline-block w-2.5 h-2.5 ink-pulse"
                style={{ background: 'var(--bauhaus-red)' }}
                aria-hidden="true"
              />
              COMPOSING
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

function SendButton({
  disabled,
  loading,
  ready,
  reduceMotion,
}: {
  disabled: boolean;
  loading: boolean;
  /** True when the user has typed something — readiness affordance. */
  ready: boolean;
  reduceMotion: boolean;
}) {
  // Triangle's tip nudges 1.5 px to the right + the circle's fill warms to
  // bauhaus-yellow when there's text waiting to be sent. Small but reads
  // as "the button is alert".
  const tipNudge = ready && !reduceMotion ? 1.5 : 0;
  const circleFill = ready ? 'var(--bauhaus-yellow)' : 'var(--cream)';

  return (
    <motion.button
      type="submit"
      aria-label="Send question"
      disabled={disabled}
      className="hairline-input flex items-center justify-center w-[3.25rem] md:w-[4.5rem] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      style={{
        background: loading ? 'var(--bauhaus-yellow)' : 'var(--off-black)',
        borderLeftWidth: 0,
      }}
      whileHover={disabled || reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.95 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.svg
        viewBox="0 0 32 32"
        width="28"
        height="28"
        aria-hidden="true"
        animate={
          reduceMotion
            ? undefined
            : loading
            ? { rotate: 360 }
            : { rotate: 0 }
        }
        transition={
          loading && !reduceMotion
            ? { duration: 1.6, repeat: Infinity, ease: 'linear' }
            : { duration: 0.4 }
        }
      >
        {loading ? (
          <rect x="6" y="6" width="20" height="20" fill="var(--off-black)" />
        ) : (
          <>
            <motion.circle
              cx="16"
              cy="16"
              r="15"
              animate={{ fill: circleFill }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
            <motion.polygon
              animate={{
                points: `13,9 ${24 + tipNudge},16 13,23`,
              }}
              transition={{ type: 'spring', stiffness: 360, damping: 22 }}
              fill="var(--off-black)"
            />
          </>
        )}
      </motion.svg>
    </motion.button>
  );
}
