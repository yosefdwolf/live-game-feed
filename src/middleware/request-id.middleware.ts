import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique request ID to every incoming request.
 * Used for log correlation across all layers of the stack.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
