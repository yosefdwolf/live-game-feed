/**
 * Base application error.
 * isOperational = true means this is a known, expected error condition.
 * isOperational = false means something unexpected happened (bug).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    // Maintain proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/** 400 — Input validation failed */
export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/** 401 — Not authenticated */
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** 403 — Authenticated but not authorized */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** 409 — State conflict (duplicate, invalid state transition, etc.) */
export class ConflictError extends AppError {
  constructor(message = 'A conflict occurred with the current state of the resource') {
    super(message, 409, 'CONFLICT');
  }
}
