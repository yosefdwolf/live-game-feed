import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../shared/errors/app-errors';
import { errorResponse } from '../shared/response/api-response';

/**
 * Centralized Express error handler.
 * Must be registered last (after all routes) with exactly 4 parameters.
 *
 * - AppErrors are returned with their status code and client-safe message.
 * - Unknown errors are logged with full context server-side, then a generic
 *   500 is returned to the client — stack traces never leave the server.
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Operational errors: send structured error to client
    const body = errorResponse(err.code, err.message, req.requestId);

    // Include validation details only for 400 errors
    if (err instanceof ValidationError && err.details) {
      res.status(err.statusCode).json({ ...body, details: err.details });
      return;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected errors: log everything, send nothing internal to client
  const error = err as Error;
  console.error('Unhandled internal error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: error?.message,
    stack: error?.stack,
  });

  res.status(500).json(
    errorResponse(
      'INTERNAL_SERVER_ERROR',
      'An unexpected error occurred. Please try again later.',
      req.requestId,
    ),
  );
}
