import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../domains/auth/auth.service';
import { AuthError, ForbiddenError } from '../shared/errors/app-errors';

interface RequireAuthOptions {
  adminOnly?: boolean;
}

/**
 * Factory that returns an Express middleware enforcing API key authentication.
 *
 * - Extracts Bearer token from Authorization header
 * - Validates via AuthService (cache-first, then Postgres)
 * - Attaches authContext to req for downstream use
 * - If adminOnly: rejects game-scoped keys
 * - If route has :gameId param and key is game-scoped: verifies scope matches
 */
export function requireAuth(options: RequireAuthOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError('Missing or malformed Authorization header. Expected: Bearer <key>');
      }

      const rawKey = authHeader.slice(7).trim();
      if (!rawKey) {
        throw new AuthError('API key must not be empty');
      }

      // AuthService performs SHA-256 hash → cache → Postgres lookup
      const authService = req.app.locals.authService as AuthService;
      const apiKey = await authService.validateKey(rawKey);

      const isAdmin = apiKey.gameId === null;

      req.authContext = {
        keyId: apiKey.id,
        gameId: apiKey.gameId,
        isAdmin,
      };

      if (options.adminOnly && !isAdmin) {
        throw new ForbiddenError('This endpoint requires an admin API key');
      }

      // If the key is game-scoped and the route targets a specific game,
      // verify the key is authorized for that exact game.
      if (!isAdmin && req.params.gameId) {
        if (apiKey.gameId !== req.params.gameId) {
          throw new ForbiddenError(
            'This API key is not authorized for the requested game',
          );
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
