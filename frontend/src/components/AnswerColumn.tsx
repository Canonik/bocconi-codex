import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AskResponse } from '@/lib/api';
import { VERTICALE_META } from '@/lib/verticali';
import { Primitive, VERTICALE_PRIMITIVE, type PrimitiveKind } from '@/components/primitives';

interface AnswerColumnProps {
  question: string;
  response: AskResponse;
  /** `current` — newest, character-stagger reveal. `archived` — older, instant. */
  variant?: 'current' | 'archived';
  ordinal?: number;
}

const STAGGER_BUDGET = 200;

/**
 * Strip the most common Markdown markers so the character-stagger reveal
 * shows clean prose. Once the stagger completes, the full answer is handed
 * to ReactMarkdown which renders the markup properly.
 */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, '$1$2')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '');
}

export function AnswerColumn({
  question,
  response,
  variant = 'current',
  ordinal,
}: AnswerColumnProps) {
  const meta = VERTICALE_META[response.verticale];
  const tint = `var(${meta.colorVar})`;
  const primitiveKind = VERTICALE_PRIMITIVE[response.verticale];
  const isArchived = variant === 'archived';
  const reduceMotion = useReducedMotion();

  const [staggerDone, setStaggerDone] = useState(isArchived || !!reduceMotion);

  // First-200-chars character stagger only on the "current" article.
  const head = useMemo(
    () => (isArchived ? '' : stripMarkdown(response.answer.slice(0, STAGGER_BUDGET))),
    [response.answer, isArchived],
  );

  // Head reveal duration ≈ 12ms × visible chars, capped.
  useEffect(() => {
    if (isArchived || reduceMotion) {
      setStaggerDone(true);
      return;
    }
    setStaggerDone(false);
    const total = Math.min(head.length * 12, 1500);
    const id = window.setTimeout(() => setStaggerDone(true), total + 60);
    return () => window.clearTimeout(id);
  }, [head, isArchived, reduceMotion]);

  return (
    <motion.article
      aria-labelledby={isArchived ? undefined : 'answer-heading'}
      data-variant={variant}
      // Only the freshly-revealed current article slides in from above.
      // Archived articles render flat — no flicker on every re-render.
      initial={reduceMotion || isArchived ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 240,
        damping: 26,
        opacity: { duration: 0.25 },
      }}
      className={
        isArchived
          ? 'mx-auto max-w-[40rem] px-5 py-6 md:px-8 md:py-7 border-t-[3px]'
          : 'mx-auto max-w-[40rem] px-5 py-7 md:px-8 md:py-10'
      }
      style={isArchived ? { borderColor: 'var(--off-black)' } : undefined}
    >
      <header className={isArchived ? 'mb-3' : 'mb-5'}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="eyebrow inline-flex items-center gap-2"
            style={{ color: 'var(--off-black)' }}
          >
            <Primitive kind={primitiveKind} size={12} fill={tint} />
            {meta.eyebrow}
            {ordinal !== undefined && (
              <span
                className="ml-1 tabular-nums"
                style={{ color: 'var(--muted-foreground)' }}
              >
                · {String(ordinal).padStart(2, '0')}
              </span>
            )}
          </span>
        </div>

        <h2
          id={isArchived ? undefined : 'answer-heading'}
          className={
            'font-sans font-bold mt-2 leading-snug ' +
            (isArchived
              ? 'text-[1.05rem] md:text-[1.1rem]'
              : 'text-[1.2rem] md:text-[1.35rem]')
          }
          style={{ color: 'var(--off-black)' }}
        >
          {question}
        </h2>
      </header>

      <div
        className="typeset font-sans"
        style={{
          fontSize: 'clamp(1.05rem, 1.5vw, 1.25rem)',
          lineHeight: 1.55,
        }}
        data-slot="answer-body"
      >
        {!isArchived && head.length > 0 && !staggerDone ? (
          <p>
            <CharStagger text={head} />
          </p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {response.answer}
          </ReactMarkdown>
        )}
      </div>

      <Bibliography
        sources={response.sources}
        verticale={response.verticale}
        compact={isArchived}
        animate={!isArchived && !reduceMotion}
      />
    </motion.article>
  );
}

function CharStagger({ text }: { text: string }) {
  // Render as inline spans with a per-char fade. CSS-driven via inline delays
  // to avoid creating thousands of motion components.
  return (
    <span aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            opacity: 0,
            display: 'inline',
            animation: `phrase-fade 220ms ease-out forwards`,
            animationDelay: `${i * 12}ms`,
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

interface BibliographyProps {
  sources: string[];
  verticale: AskResponse['verticale'];
  compact?: boolean;
  animate?: boolean;
}

function Bibliography({ sources, verticale, compact, animate }: BibliographyProps) {
  const meta = VERTICALE_META[verticale];
  const tint = `var(${meta.colorVar})`;
  const kind = VERTICALE_PRIMITIVE[verticale];

  if (sources.length === 0) {
    return (
      <footer
        className={
          compact ? 'mt-5 pt-3 border-t-[2px]' : 'mt-9 pt-5 border-t-[2px]'
        }
        style={{ borderColor: 'var(--off-black)' }}
      >
        <p className="eyebrow mb-2">SOURCES</p>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Beatrice did not cite any source for this answer.
        </p>
      </footer>
    );
  }

  return (
    <footer
      className={
        compact ? 'mt-5 pt-3 border-t-[2px]' : 'mt-9 pt-5 border-t-[2px]'
      }
      style={{ borderColor: 'var(--off-black)' }}
    >
      <p className="eyebrow mb-3 inline-flex items-center gap-2">
        <Primitive kind={kind} size={10} fill={tint} />
        SOURCES
      </p>
      <ol className="space-y-1.5 list-none">
        {sources.map((s, i) => (
          <SourceRow
            key={`${s}-${i}`}
            index={i + 1}
            path={s}
            tint={tint}
            kind={kind}
            animate={animate}
            delay={i}
          />
        ))}
      </ol>
    </footer>
  );
}

function SourceRow({
  index,
  path,
  tint,
  kind,
  animate,
  delay,
}: {
  index: number;
  path: string;
  tint: string;
  kind: PrimitiveKind;
  animate?: boolean;
  delay: number;
}) {
  const [copied, setCopied] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const isUrl = /^https?:\/\//.test(path);

  async function handleClick() {
    if (isUrl) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 320);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* no-op */
    }
  }

  const inner = (
    <>
      <Primitive kind={kind} size={10} fill={tint} className="shrink-0" />
      <span
        className="font-mono text-[0.72rem] tabular-nums shrink-0"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {String(index).padStart(2, '0')}
      </span>
      <span className="relative flex-1 min-w-0">
        <code
          className="source-path font-mono text-[0.78rem] md:text-[0.82rem] leading-snug break-all"
          style={{ color: 'var(--off-black)' }}
        >
          {path}
        </code>
      </span>
    </>
  );

  const motionProps = animate
    ? {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          delay: 0.1 + delay * 0.08,
          type: 'spring' as const,
          stiffness: 220,
          damping: 22,
        },
      }
    : {};

  return (
    <motion.li {...motionProps} className="relative">
      <AnimatePresence>
        {copied && (
          <motion.span
            key="copied"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18 }}
            className="absolute -top-3 left-7 eyebrow"
            style={{ color: 'var(--bauhaus-red)' }}
            aria-live="polite"
          >
            COPIED
          </motion.span>
        )}
      </AnimatePresence>

      {isUrl ? (
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="source-row flex items-center gap-3 px-2 py-1 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bauhaus-red)]"
          style={{
            background: flashing ? tint : undefined,
            transition: 'background 220ms ease',
          }}
        >
          {inner}
        </a>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title="Click to copy path"
          className="source-row flex w-full items-center gap-3 text-left px-2 py-1 -mx-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bauhaus-red)]"
          style={{
            background: flashing ? tint : undefined,
            transition: 'background 220ms ease',
          }}
        >
          {inner}
        </button>
      )}
    </motion.li>
  );
}
