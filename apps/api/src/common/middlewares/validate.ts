import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Request input validation middleware — shared by every feature module.
 *
 * Validates one or more of the request's input surfaces (`body`, `query`,
 * `params`) against a Zod schema and, on success, **normalizes** the request
 * by replacing the raw input with the schema's parsed (possibly transformed)
 * output — e.g. the shared `nameSchema` trims whitespace. On failure it
 * forwards the {@link ZodError} to the global error handler, which maps it to
 * the standard `400 VALIDATION_ERROR` envelope with per-field `details`.
 *
 * Usage:
 * ```ts
 * // any combination of sources in one call
 * router.post('/:slug', validate({ params: slugParamsSchema, body: createWorkspaceSchema }), handler)
 *
 * // or per-source
 * router.patch('/:slug', validate.params(slugParamsSchema), validate.body(updateWorkspaceSchema), handler)
 * ```
 *
 * The API is the authority on validation (Implementation Plan §1.2): this
 * guard runs at the route boundary before any permission/controller logic.
 */

export type ValidationSource = 'body' | 'query' | 'params';

export interface ValidateInput {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

type ExpressHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => void;

const SOURCES: readonly ValidationSource[] = ['body', 'query', 'params'];

function forSource(
  source: ValidationSource,
  schema: ZodTypeAny,
): ExpressHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      // The global errorHandler rewrites ZodError into the 400 VALIDATION_ERROR
      // envelope with { field, message } details.
      next(result.error);
      return;
    }

    // Normalize: hand the controller/service the schema-validated (and
    // transformed) value instead of trusting raw client input downstream.
    switch (source) {
      case 'body':
        request.body = result.data;
        break;
      case 'query':
        request.query = result.data as Request['query'];
        break;
      case 'params':
        request.params = result.data as Request['params'];
        break;
    }

    next();
  };
}

export const validate = {
  body: (schema: ZodTypeAny): ExpressHandler => forSource('body', schema),
  query: (schema: ZodTypeAny): ExpressHandler => forSource('query', schema),
  params: (schema: ZodTypeAny): ExpressHandler => forSource('params', schema),

  /**
   * Validate any subset of { body, query, params } in a single guard. The
   * sources are validated in a stable order (body → query → params) so error
   * responses are deterministic.
   */
  all: (input: ValidateInput): ExpressHandler => {
    const entries = SOURCES.filter(
      (source): source is ValidationSource => input[source] !== undefined,
    ).map((source) => [source, input[source]!] as const);

    return (request, response, next) => {
      let index = 0;
      const runNext = (error?: unknown): void => {
        if (error) {
          next(error);
          return;
        }
        const entry = entries[index];
        index += 1;
        if (!entry) {
          next();
          return;
        }
        const [source, schema] = entry;
        const result = schema.safeParse(request[source]);
        if (!result.success) {
          next(result.error);
          return;
        }
        switch (source) {
          case 'body':
            request.body = result.data;
            break;
          case 'query':
            request.query = result.data as Request['query'];
            break;
          case 'params':
            request.params = result.data as Request['params'];
            break;
        }
        runNext();
      };
      runNext();
    };
  },
};
