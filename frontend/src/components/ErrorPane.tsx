import type { AskError } from '@/lib/api';

interface ErrorPaneProps {
  question: string;
  error: AskError | null;
  onRetry: () => void;
  onReset: () => void;
}

function describe(err: AskError | null): string {
  if (!err) return 'Something went sideways while reaching the press.';
  switch (err.code) {
    case 'network':
      return "Beatrice couldn't reach the press. The backend may still be warming up.";
    case 'http':
      return `The press returned an unexpected status${err.status ? ` (${err.status})` : ''}.`;
    case 'parse':
      return 'The response came back in an unreadable shape.';
    case 'shape':
      return "The response didn't match the expected {answer, sources, verticale} contract.";
    case 'aborted':
      return 'You stopped the request before Beatrice finished.';
  }
}

export function ErrorPane({ question, error, onRetry, onReset }: ErrorPaneProps) {
  return (
    <article
      role="alert"
      aria-live="polite"
      className="mx-auto max-w-[40rem] px-5 py-7 md:px-8 md:py-10"
    >
      <header className="mb-4">
        <span
          className="eyebrow inline-flex items-center gap-2"
          style={{ color: 'var(--bauhaus-red)' }}
        >
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5"
            style={{ background: 'var(--bauhaus-red)' }}
          />
          ERRATA
        </span>
        <h2
          className="font-sans font-bold mt-2 leading-snug text-[1.05rem] md:text-[1.15rem]"
          style={{ color: 'var(--off-black)' }}
        >
          {question}
        </h2>
      </header>

      <p
        className="font-sans leading-[1.55] max-w-prose"
        style={{ color: 'var(--off-black)', fontSize: 'clamp(1.05rem, 1.5vw, 1.25rem)' }}
      >
        {describe(error)}
      </p>
      <p
        className="text-sm mt-2 font-sans"
        style={{ color: 'var(--muted-foreground)' }}
      >
        It happens. Try again — the issue isn't going anywhere.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="hairline-input h-11 px-5 font-sans font-bold text-sm uppercase tracking-[0.14em]"
          style={{ background: 'var(--off-black)', color: 'var(--cream)', borderColor: 'var(--off-black)' }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onReset}
          className="hairline-input h-11 px-5 font-sans font-medium text-sm uppercase tracking-[0.14em]"
          style={{ background: 'var(--cream)', color: 'var(--off-black)', borderColor: 'var(--off-black)' }}
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}
