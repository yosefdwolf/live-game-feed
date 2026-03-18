import crypto from 'crypto';
import { AuthRepository } from './auth.repository';
import { AuthCacheRepository } from './auth.cache-repository';
import { ApiKey, ApiKeyCreated, CreateApiKeyInput } from './auth.types';
import { AuthError } from '../../shared/errors/app-errors';

const KEY_PREFIX = 'lgf_v1_';

/**
 * Computes the SHA-256 hex digest of the raw API key.
 * This is the only representation stored in the database.
 */
function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authCacheRepository: AuthCacheRepository,
  ) {}

  /**
   * Validates a raw API key from an Authorization header.
   * Strategy: SHA-256 hash → Redis cache → Postgres fallback → validate state → touch last_used (fire-and-forget).
   * Throws AuthError for any invalid or expired state.
   */
  async validateKey(rawKey: string): Promise<ApiKey> {
    const keyHash = hashKey(rawKey);

    // Cache-first lookup
    let apiKey = await this.authCacheRepository.getCachedKey(keyHash);

    if (!apiKey) {
      apiKey = await this.authRepository.findByKeyHash(keyHash);
      if (!apiKey) {
        throw new AuthError('Invalid API key');
      }
      // Warm the cache for subsequent requests
      await this.authCacheRepository.setCachedKey(keyHash, apiKey);
    }

    if (!apiKey.isActive) {
      throw new AuthError('API key has been revoked');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AuthError('API key has expired');
    }

    // Update last_used_at without blocking the response
    this.authRepository.touchLastUsed(apiKey.id).catch((err: Error) => {
      console.error('Failed to touch last_used_at', { keyId: apiKey!.id, error: err.message });
    });

    return apiKey;
  }

  /**
   * Generates a new API key.
   * The raw key is returned once and never stored — only its hash is persisted.
   * Format: lgf_v1_<32 random hex bytes>
   */
  async createKey(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
    const rawKey = `${KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashKey(rawKey);

    const created = await this.authRepository.create(keyHash, input);

    return {
      id: created.id,
      rawKey,
      label: created.label,
      gameId: created.gameId,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    };
  }

  /**
   * Revokes an API key by id.
   * Also invalidates the Redis cache immediately so the key stops working at once.
   */
  async revokeKey(keyId: string, keyHash?: string): Promise<void> {
    await this.authRepository.revoke(keyId);
    if (keyHash) {
      await this.authCacheRepository.invalidateCachedKey(keyHash);
    }
  }
}
