export type Verticale =
  | 'relocation'
  | 'life_on_campus'
  | 'study_abroad'
  | 'career_readiness';

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
  sources: string[];
  verticale: Verticale;
}

export type AskErrorCode = 'network' | 'http' | 'parse' | 'shape' | 'aborted';

export class AskError extends Error {
  readonly code: AskErrorCode;
  readonly status?: number;
  constructor(code: AskErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.name = 'AskError';
  }
}

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  'http://localhost:8000';

export async function askBuddy(
  question: string,
  signal?: AbortSignal,
): Promise<AskResponse> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question } satisfies AskRequest),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === 'AbortError') {
      throw new AskError('aborted');
    }
    throw new AskError('network', String(err));
  }
  if (!res.ok) {
    throw new AskError('http', `HTTP ${res.status}`, res.status);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new AskError('parse', String(err));
  }
  if (!isAskResponse(data)) {
    throw new AskError('shape', 'response did not match {answer, sources, verticale}');
  }
  return data;
}

function isAskResponse(x: unknown): x is AskResponse {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.answer !== 'string') return false;
  if (!Array.isArray(o.sources)) return false;
  if (!o.sources.every((s: unknown) => typeof s === 'string')) return false;
  return (
    o.verticale === 'relocation' ||
    o.verticale === 'life_on_campus' ||
    o.verticale === 'study_abroad' ||
    o.verticale === 'career_readiness'
  );
}
