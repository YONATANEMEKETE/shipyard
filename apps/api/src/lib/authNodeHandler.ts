import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import type { ErrorResponse } from '@shipyard/shared';
import { auth } from './auth.js';
import { logger } from '../common/logger/index.js';
import { ErrorCodes } from '../common/errors/codes.js';
import {
  isInternalAuthError,
  mapAuthError,
} from '../common/errors/authErrorMap.js';

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred';
const REQUEST_FAILED_MESSAGE = 'Request failed';

/**
 * Express adapter for Better Auth that rewrites error responses into the
 * app's envelope contract ({ error: { code, message, details? } }).
 *
 * `toNodeHandler(auth)` would let Better Auth's internal router answer with
 * its own raw format ({ code, message }), bypassing the global Express error
 * handler entirely. This adapter converts the request to a fetch Request,
 * calls the auth handler, and then:
 *   - passes 2xx/3xx responses through untouched (OAuth redirects must never
 *     be rewritten),
 *   - rewrites 4xx/5xx JSON bodies carrying a Better Auth `{ code, message }`
 *     shape into the shared envelope, mapping codes via authErrorMap,
 *   - leaves any non-JSON or unrecognized body as-is.
 *
 * Modeled on better-call's own node adapter (getRequest/setResponse).
 */

function buildRequestBody(
  req: IncomingMessage & { body?: unknown },
): BodyInit | undefined {
  const method = req.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return undefined;

  // express.json() has already consumed and parsed JSON bodies before the
  // auth route runs; re-serialize them. Anything else is piped raw.
  if (req.body !== undefined) {
    const content =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      },
    });
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      req.on('error', (error) => controller.error(error));
      req.on('end', () => controller.close());
      req.on('data', (chunk: Buffer) =>
        controller.enqueue(new Uint8Array(chunk)),
      );
    },
    cancel() {
      req.destroy();
    },
  });
}

function buildAuthRequest(
  req: IncomingMessage & { body?: unknown; originalUrl?: string },
): Request {
  const protocol =
    'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
  const host = req.headers.host ?? '';
  const url = `${protocol}://${host}${req.originalUrl ?? req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: buildRequestBody(req),
    // Node's undici requires this for streaming request bodies
    duplex: 'half',
  } as RequestInit);
}

function setResponseHeaders(res: ServerResponse, response: Response): void {
  for (const [key, value] of response.headers) {
    if (key === 'set-cookie') continue;
    try {
      res.setHeader(key, value);
    } catch {
      // Header values that Node rejects are non-essential for auth flows
    }
  }
  // getSetCookie() returns each cookie separately, avoiding the lossy
  // comma-join that response.headers.get('set-cookie') produces
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
}

async function streamResponseBody(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(value)) {
      await new Promise<void>((resolve) => res.once('drain', resolve));
    }
  }
  res.end();
}

function createEnvelope(
  statusCode: number,
  code: string,
  message: string,
  authCode?: string,
): ErrorResponse<{ auth?: string }> {
  return {
    error: {
      code,
      message,
      ...(authCode !== undefined ? { details: { auth: authCode } } : {}),
    },
  };
}

interface ParsedAuthErrorBody {
  code?: string;
  message?: string;
}

function parseAuthErrorBody(raw: string): ParsedAuthErrorBody | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    const result: ParsedAuthErrorBody = {};
    if (typeof record.code === 'string') result.code = record.code;
    if (typeof record.message === 'string') result.message = record.message;
    return result.code !== undefined || result.message !== undefined
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

async function handleAuthRequest(
  expressReq: ExpressRequest,
  expressRes: ExpressResponse,
): Promise<void> {
  const response = await auth.handler(buildAuthRequest(expressReq));

  const { status } = response;

  // Only rewrite JSON error bodies; success responses and redirects (OAuth
  // callbacks rely on them) pass through untouched.
  const contentType = response.headers.get('content-type') ?? '';
  if (status < 400 || !contentType.includes('application/json')) {
    setResponseHeaders(expressRes, response);
    expressRes.statusCode = status;
    await streamResponseBody(expressRes, response);
    return;
  }

  const parsed = parseAuthErrorBody(await response.text());
  if (!parsed) {
    // Unrecognized error payload — forward it unchanged rather than guessing
    setResponseHeaders(expressRes, response);
    expressRes.statusCode = status;
    expressRes.end();
    return;
  }

  const mapped = mapAuthError(parsed.code, status);
  const message = isInternalAuthError(mapped)
    ? GENERIC_ERROR_MESSAGE
    : (parsed.message ?? REQUEST_FAILED_MESSAGE);

  logger.warn(
    {
      errorCode: mapped.code,
      statusCode: mapped.statusCode,
      method: expressReq.method,
      path: expressReq.originalUrl,
      ...(parsed.code !== undefined ? { authErrorCode: parsed.code } : {}),
    },
    'Auth request failed',
  );

  setResponseHeaders(expressRes, response);
  expressRes.removeHeader('content-length');
  expressRes
    .status(mapped.statusCode)
    .json(createEnvelope(mapped.statusCode, mapped.code, message, parsed.code));
}

export function authNodeHandler(
  req: ExpressRequest,
  res: ExpressResponse,
): void {
  handleAuthRequest(req, res).catch((error: unknown) => {
    logger.error(
      {
        err: error,
        errorCode: ErrorCodes.INTERNAL_SERVER_ERROR,
        method: req.method,
        path: req.originalUrl,
      },
      'Unhandled auth handler error',
    );
    res
      .status(500)
      .json(
        createEnvelope(
          500,
          ErrorCodes.INTERNAL_SERVER_ERROR,
          GENERIC_ERROR_MESSAGE,
        ),
      );
  });
}
