import { Pool } from 'pg';
import { ApiKey, CreateApiKeyInput } from './auth.types';

/**
 * Maps a database row (snake_case) to the ApiKey domain type (camelCase).
 */
function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    keyHash: row.key_hash as string,
    label: row.label as string,
    gameId: row.game_id as string | null,
    isActive: row.is_active as boolean,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class AuthRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Looks up an active API key by its SHA-256 hash.
   * Returns null if the key does not exist or is not active.
   */
  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const result = await this.pool.query(
      `SELECT id, key_hash, label, game_id, is_active, last_used_at, expires_at, created_at, updated_at
         FROM api_keys
        WHERE key_hash = $1 AND is_active = TRUE
        LIMIT 1`,
      [keyHash],
    );
    if (result.rows.length === 0) return null;
    return rowToApiKey(result.rows[0]);
  }

  /**
   * Inserts a new API key record. The raw key must never be passed here —
   * only the pre-computed SHA-256 hash.
   */
  async create(keyHash: string, input: CreateApiKeyInput): Promise<ApiKey> {
    const result = await this.pool.query(
      `INSERT INTO api_keys (key_hash, label, game_id)
       VALUES ($1, $2, $3)
       RETURNING id, key_hash, label, game_id, is_active, last_used_at, expires_at, created_at, updated_at`,
      [keyHash, input.label, input.gameId ?? null],
    );
    return rowToApiKey(result.rows[0]);
  }

  /**
   * Deactivates a key by id. The key is soft-disabled — never deleted.
   */
  async revoke(keyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [keyId],
    );
  }

  /**
   * Updates last_used_at to NOW for analytics purposes.
   * Called fire-and-forget — callers must not await this for latency.
   */
  async touchLastUsed(keyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyId],
    );
  }
}
