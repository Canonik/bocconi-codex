import { useCallback, useMemo, useRef, useState } from 'react';
import { ResourcesPanel } from '@/components/ResourcesPanel';
import { ResourcesTrigger } from '@/components/ResourcesTrigger';
import { motion, useReducedMotion } from 'motion/react';
import { Masthead } from '@/components/Masthead';
import { Composer } from '@/components/Composer';
import { IssueGrid } from '@/components/IssueGrid';
import { ThinkingColumn } from '@/components/ThinkingColumn';
import { AnswerColumn } from '@/components/AnswerColumn';
import { ErrorPane } from '@/components/ErrorPane';
import { CursorOrb } from '@/components/CursorOrb';
import { OrientationCue } from '@/components/OrientationCue';
import { ScrollProgress } from '@/components/ScrollProgress';
import { LiveClock } from '@/components/LiveClock';
import { IssueRuntime } from '@/components/IssueRuntime';
import { Primitive, VERTICALE_PRIMITIVE } from '@/components/primitives';
import { askBuddy, AskError } from '@/lib/api';
import type { AskResponse, Verticale } from '@/lib/api';
import { VERTICALI, VERTICALE_META } from '@/lib/verticali';

interface Article {
  id: string;
  question: string;
  response: AskResponse;
  askedAt: number;
}

type InFlight = { question: string; suggested?: Verticale } | null;
type LastError = { question: string; error: AskError | null } | null;

const ISSUE_NUMBER = 1;
const ISSUE_DATE = formatIssueDate(new Date());
const ARTICLE_CAP = 6;

function formatIssueDate(d: Date): string {
  const months = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ] as const;
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `art-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [inFlight, setInFlight] = useState<InFlight>(null);
  const [lastError, setLastError] = useState<LastError>(null);
  const [draft, setDraft] = useState('');
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const inFlightAbort = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();

  const submit = useCallback(
    async (questionRaw: string, suggested?: Verticale) => {
      const question = questionRaw.trim();
      if (question.length === 0) return;

      inFlightAbort.current?.abort();
      const ac = new AbortController();
      inFlightAbort.current = ac;

      setLastError(null);
      setInFlight({ question, suggested });

      try {
        const response = await askBuddy(question, ac.signal);
        if (ac.signal.aborted) return;
        setArticles((prev) => {
          const next: Article[] = [
            { id: newId(), question, response, askedAt: Date.now() },
            ...prev,
          ];
          return next.slice(0, ARTICLE_CAP);
        });
        setInFlight(null);
      } catch (err) {
        if (ac.signal.aborted) return;
        const askErr = err instanceof AskError ? err : null;
        setLastError({ question, error: askErr });
        setInFlight(null);
      }
    },
    [],
  );

  const handleComposerSubmit = useCallback(() => {
    const q = draft.trim();
    if (q.length === 0) return;
    setDraft('');
    void submit(q);
  }, [draft, submit]);

  const handleChip = useCallback(
    (q: string, suggested?: Verticale) => {
      setDraft('');
      void submit(q, suggested);
    },
    [submit],
  );

  const handleRetry = useCallback(() => {
    if (lastError) void submit(lastError.question);
  }, [lastError, submit]);

  const handleClearAll = useCallback(() => {
    inFlightAbort.current?.abort();
    setInFlight(null);
    setLastError(null);
    setArticles([]);
    setDraft('');
  }, []);

  const handleDismissError = useCallback(() => setLastError(null), []);

  const composerDisabled = inFlight !== null;
  const isIdle = articles.length === 0 && inFlight === null && lastError === null;

  const highlightVerticale: Verticale | null = useMemo(() => {
    if (inFlight?.suggested) return inFlight.suggested;
    if (articles[0]) return articles[0].response.verticale;
    return null;
  }, [inFlight, articles]);

  return (
    <div className="min-h-screen flex flex-col bg-cream relative">
      <ScrollProgress verticale={highlightVerticale} hidden={isIdle} />
      <CursorOrb verticale={highlightVerticale} paused={!isIdle || resourcesOpen} />
      <ResourcesTrigger onClick={() => setResourcesOpen(true)} />
      <ResourcesPanel open={resourcesOpen} onClose={() => setResourcesOpen(false)} />

      <div className="relative z-10 flex flex-col flex-1">
        <Masthead
          issue={ISSUE_NUMBER}
          date={ISSUE_DATE}
          thinking={inFlight !== null}
          highlightVerticale={highlightVerticale}
          articleCount={articles.length}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={handleComposerSubmit}
          disabled={composerDisabled}
        />

        {isIdle && <OrientationCue />}

        <main className="flex-1">
          {inFlight !== null && (
            <ThinkingColumn
              question={inFlight.question}
              verticale={inFlight.suggested ?? null}
            />
          )}

          {lastError !== null && (
            <ErrorPane
              question={lastError.question}
              error={lastError.error}
              onRetry={handleRetry}
              onReset={handleDismissError}
            />
          )}

          {articles.map((a, i) => (
            <AnswerColumn
              key={a.id}
              question={a.question}
              response={a.response}
              variant={
                i === 0 && inFlight === null && lastError === null
                  ? 'current'
                  : 'archived'
              }
              ordinal={articles.length - i}
            />
          ))}

          {isIdle && <IssueGrid onPick={handleChip} />}

          {!isIdle && (
            <motion.section
              aria-label="Issue actions"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mx-auto max-w-3xl px-5 pb-12 md:px-10 flex flex-wrap items-center gap-3"
            >
              <button
                type="button"
                onClick={handleClearAll}
                className="hairline-input h-10 px-4 font-sans text-sm uppercase tracking-[0.14em] font-medium"
                style={{ background: 'var(--cream)', color: 'var(--off-black)' }}
              >
                ← START A FRESH ISSUE
              </button>
              {articles.length > 0 && (
                <span className="eyebrow-soft self-center">
                  {articles.length === ARTICLE_CAP
                    ? `ISSUE FULL · ${ARTICLE_CAP} ARTICLES`
                    : `${articles.length} OF ${ARTICLE_CAP} ARTICLES`}
                </span>
              )}
            </motion.section>
          )}
        </main>

        <footer
          className="border-t-[3px]"
          style={{ borderColor: 'var(--off-black)' }}
        >
          <div className="mx-auto max-w-6xl px-5 py-4 md:px-10 flex items-center gap-3">
            {/* Primitive ribbon — quiet typographic mark with a gentle breathing
                animation; doubles as a key to the 4 verticali. */}
            <div className="flex items-center gap-3" aria-hidden="true">
              {VERTICALI.map((v, i) => (
                <motion.span
                  key={v}
                  className="inline-flex"
                  animate={
                    reduceMotion
                      ? undefined
                      : { y: [0, -2, 0, 2, 0] }
                  }
                  transition={
                    reduceMotion
                      ? undefined
                      : {
                          duration: 4.6,
                          delay: i * 0.32,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }
                  }
                >
                  <Primitive
                    kind={VERTICALE_PRIMITIVE[v]}
                    size={12}
                    fill={`var(${VERTICALE_META[v].colorVar})`}
                  />
                </motion.span>
              ))}
            </div>
            <div
              className="flex-1 h-[2px]"
              style={{ background: 'var(--off-black)' }}
            />
            <IssueRuntime className="hidden md:inline" />
            <LiveClock className="hidden sm:inline" />
          </div>
        </footer>
      </div>
    </div>
  );
}
