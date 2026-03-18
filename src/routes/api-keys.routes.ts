import { Router } from 'express';
import { z } from 'zod';
import { ApiKeysController } from '../controllers/api-keys.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';

const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(100),
  gameId: z.string().uuid().optional(),
});

export function createApiKeysRouter(apiKeysController: ApiKeysController): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth({ adminOnly: true }),
    authRateLimit,
    validate(CreateApiKeySchema),
    apiKeysController.generate,
  );

  router.delete(
    '/:keyId',
    requireAuth({ adminOnly: true }),
    apiKeysController.revoke,
  );

  return router;
}
