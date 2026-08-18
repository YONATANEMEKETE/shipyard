export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly publicDetails?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { publicDetails?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.publicDetails = options?.publicDetails;
    Error.captureStackTrace?.(this, new.target);
  }
}
