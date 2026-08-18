import { z } from 'zod';

export const errorFieldSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  details: z.unknown().optional(),
});

export type ErrorField = z.infer<typeof errorFieldSchema>;

export const errorResponseSchema = z.object({
  error: errorFieldSchema,
});

export type ErrorResponse<TDetails = unknown> = {
  error: ErrorField & { details?: TDetails };
};

export const successResponseSchema = z.object({
  data: z.unknown(),
});

export type SuccessResponse<T> = {
  data: T;
};

export const listResponseSchema = z.object({
  items: z.array(z.unknown()),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type ListResponse<
  T,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = {
  items: T[];
  meta?: TMeta;
};
