export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, message);
  }

  static badRequest(message = "Bad request.") {
    return new ApiError(400, message);
  }

  static conflict(message = "Resource already exists.") {
    return new ApiError(409, message);
  }

  static unauthenticated(message = "Unauthenticated.") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden.") {
    return new ApiError(403, message);
  }
}

export const getPgErrorCode = (err: unknown): string | undefined =>
  (err as { code?: string })?.code ??
  (err as { cause?: { code?: string } })?.cause?.code;

export const getPgConstraint = (err: unknown): string | undefined =>
  (err as { constraint?: string })?.constraint ??
  (err as { cause?: { constraint?: string } })?.cause?.constraint;
