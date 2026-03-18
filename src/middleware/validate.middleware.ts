import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../shared/errors/app-errors';

/**
 * Middleware factory that parses and validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (coerced) value.
 * On failure, throws a ValidationError with structured Zod error details.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formatted = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new ValidationError('Request validation failed', formatted));
    }
    req.body = result.data;
    next();
  };
}
