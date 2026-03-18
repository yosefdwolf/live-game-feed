import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../domains/auth/auth.service';
import { CreateApiKeyInput } from '../domains/auth/auth.types';
import { successResponse } from '../shared/response/api-response';

export class ApiKeysController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Generates a new API key.
   * The raw key is returned in the response body exactly once.
   * It is never stored and cannot be retrieved again.
   */
  generate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as CreateApiKeyInput;
      const created = await this.authService.createKey(input);
      res.status(201).json(successResponse({ apiKey: created }, req.requestId));
    } catch (err) {
      next(err);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { keyId } = req.params;
      await this.authService.revokeKey(keyId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
