import { errorResponseSchema } from '@shipyard/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Shared request helpers for the web API clients.
//
// Single source of truth for the API origin, cookie forwarding, error envelope
// parsing, and the { confirm: true } literal required by destructive endpoints.
// ─────────────────────────────────────────────────────────────────────────────

// The API lives on its own origin — `NEXT_PUBLIC_API_URL` is inlined at build
// time and the fallback matches the local dev API. Trailing slashes are
// trimmed so `${origin}${path}` never doubles up.
const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

/**
 * Resolves path-style inputs (`/api/v1/…`) against the API origin. Every web
 * client passes relative paths — they mean the API, never the web host.
 * Absolute URLs pass through untouched.
 */
export function resolveApiUrl(input: RequestInfo): RequestInfo {
  if (typeof input === 'string' && input.startsWith('/')) {
    return `${API_ORIGIN}${input}`;
  }
  return input;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export async function parseErrorEnvelope(
  response: Response,
  fallbackMessage: string,
): Promise<ErrorEnvelope> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return {
      error: {
        code: response.status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN',
        message: fallbackMessage,
      },
    };
  }

  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    return { error: parsed.data.error };
  }

  return {
    error: {
      code: 'UNKNOWN',
      message: fallbackMessage,
      details: body ?? undefined,
    },
  };
}

export async function readData<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

export interface ApiErrorCtor {
  new (args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
  }): Error;
}

export async function requestJson<T>(
  input: RequestInfo,
  init: RequestInit,
  fallbackMessage: string,
  ErrorCtor: ApiErrorCtor = ApiError,
): Promise<T> {
  const response = await fetch(resolveApiUrl(input), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  return readResponse<T>(response, fallbackMessage, ErrorCtor);
}

/**
 * Multipart variant — the one route that is not JSON (avatar upload).
 *
 * Content-Type is deliberately left unset: the browser writes it with the
 * generated `boundary=`, and a hand-set `multipart/form-data` without that
 * boundary makes the server parse an empty body instead of failing loudly.
 */
export async function requestForm<T>(
  input: string,
  body: FormData,
  fallbackMessage: string,
  ErrorCtor: ApiErrorCtor = ApiError,
): Promise<T> {
  const response = await fetch(resolveApiUrl(input), {
    method: 'POST',
    body,
    credentials: 'include',
  });

  return readResponse<T>(response, fallbackMessage, ErrorCtor);
}

/** Shared unwrap: error envelope → 204 → `{ data }`. */
async function readResponse<T>(
  response: Response,
  fallbackMessage: string,
  ErrorCtor: ApiErrorCtor,
): Promise<T> {
  if (!response.ok) {
    const envelope = await parseErrorEnvelope(response, fallbackMessage);
    throw new ErrorCtor({
      code: envelope.error.code,
      message: envelope.error.message || fallbackMessage,
      status: response.status,
      details: envelope.error.details,
      requestId: envelope.error.requestId,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return readData<T>(response);
}

export function confirmRequest<T>(
  input: string,
  fallbackMessage: string,
  ErrorCtor: ApiErrorCtor = ApiError,
): Promise<T> {
  return requestJson<T>(
    input,
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
    fallbackMessage,
    ErrorCtor,
  );
}
