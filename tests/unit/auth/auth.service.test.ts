import { AuthService } from '../../../src/domains/auth/auth.service';
import { AuthRepository } from '../../../src/domains/auth/auth.repository';
import { AuthCacheRepository } from '../../../src/domains/auth/auth.cache-repository';
import { ApiKey } from '../../../src/domains/auth/auth.types';
import { AuthError } from '../../../src/shared/errors/app-errors';

// Build a full ApiKey fixture
function buildApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-id-1',
    keyHash: 'abc123hash',
    label: 'Test Key',
    gameId: null,
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildMocks() {
  const authRepository = {
    findByKeyHash: jest.fn(),
    create: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthRepository>;

  const authCacheRepository = {
    getCachedKey: jest.fn(),
    setCachedKey: jest.fn().mockResolvedValue(undefined),
    invalidateCachedKey: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuthCacheRepository>;

  const service = new AuthService(authRepository, authCacheRepository);
  return { authRepository, authCacheRepository, service };
}

describe('AuthService', () => {
  describe('validateKey', () => {
    it('should return cached key without hitting postgres', async () => {
      const { authRepository, authCacheRepository, service } = buildMocks();
      const cachedKey = buildApiKey();
      authCacheRepository.getCachedKey.mockResolvedValue(cachedKey);

      const result = await service.validateKey('lgf_v1_somerawkey');

      expect(result).toEqual(cachedKey);
      expect(authRepository.findByKeyHash).not.toHaveBeenCalled();
    });

    it('should fall back to postgres on cache miss and warm cache', async () => {
      const { authRepository, authCacheRepository, service } = buildMocks();
      const dbKey = buildApiKey();
      authCacheRepository.getCachedKey.mockResolvedValue(null);
      authRepository.findByKeyHash.mockResolvedValue(dbKey);

      const result = await service.validateKey('lgf_v1_somerawkey');

      expect(result).toEqual(dbKey);
      expect(authRepository.findByKeyHash).toHaveBeenCalledTimes(1);
      expect(authCacheRepository.setCachedKey).toHaveBeenCalledWith(
        expect.any(String),
        dbKey,
      );
    });

    it('should throw AuthError when key is not found', async () => {
      const { authRepository, authCacheRepository, service } = buildMocks();
      authCacheRepository.getCachedKey.mockResolvedValue(null);
      authRepository.findByKeyHash.mockResolvedValue(null);

      await expect(service.validateKey('lgf_v1_invalidkey')).rejects.toBeInstanceOf(AuthError);
    });

    it('should throw AuthError when key is expired', async () => {
      const { authCacheRepository, service } = buildMocks();
      const expiredKey = buildApiKey({
        expiresAt: new Date('2020-01-01T00:00:00Z'), // In the past
      });
      authCacheRepository.getCachedKey.mockResolvedValue(expiredKey);

      await expect(service.validateKey('lgf_v1_expiredkey')).rejects.toBeInstanceOf(AuthError);
    });

    it('should throw AuthError when key is inactive', async () => {
      const { authCacheRepository, service } = buildMocks();
      const inactiveKey = buildApiKey({ isActive: false });
      authCacheRepository.getCachedKey.mockResolvedValue(inactiveKey);

      await expect(service.validateKey('lgf_v1_revokedkey')).rejects.toBeInstanceOf(AuthError);
    });

    it('should call touchLastUsed fire-and-forget after successful validation', async () => {
      const { authRepository, authCacheRepository, service } = buildMocks();
      const key = buildApiKey();
      authCacheRepository.getCachedKey.mockResolvedValue(key);
      authRepository.touchLastUsed.mockResolvedValue(undefined);

      await service.validateKey('lgf_v1_validkey');

      // Allow the fire-and-forget promise to settle
      await new Promise((resolve) => setImmediate(resolve));

      expect(authRepository.touchLastUsed).toHaveBeenCalledWith(key.id);
    });
  });

  describe('createKey', () => {
    it('should generate key with correct lgf_v1_ prefix', async () => {
      const { authRepository, service } = buildMocks();
      const stored = buildApiKey();
      authRepository.create.mockResolvedValue(stored);

      const result = await service.createKey({ label: 'New Key' });

      expect(result.rawKey).toMatch(/^lgf_v1_/);
    });

    it('should never store raw key in the database', async () => {
      const { authRepository, service } = buildMocks();
      const stored = buildApiKey();
      authRepository.create.mockResolvedValue(stored);

      const result = await service.createKey({ label: 'New Key' });

      // The hash passed to create must not equal the raw key
      const [keyHashArg] = authRepository.create.mock.calls[0];
      expect(keyHashArg).not.toEqual(result.rawKey);
      // Hash should be a 64-char hex string (SHA-256)
      expect(keyHashArg).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return rawKey only in the ApiKeyCreated response', async () => {
      const { authRepository, service } = buildMocks();
      const stored = buildApiKey();
      authRepository.create.mockResolvedValue(stored);

      const result = await service.createKey({ label: 'New Key' });

      expect(result.rawKey).toBeDefined();
      expect(result.id).toEqual(stored.id);
      expect(result.label).toEqual(stored.label);
    });
  });

  describe('revokeKey', () => {
    it('should revoke in DB and invalidate cache when keyHash provided', async () => {
      const { authRepository, authCacheRepository, service } = buildMocks();
      authRepository.revoke.mockResolvedValue(undefined);

      await service.revokeKey('key-id-1', 'somehash');

      expect(authRepository.revoke).toHaveBeenCalledWith('key-id-1');
      expect(authCacheRepository.invalidateCachedKey).toHaveBeenCalledWith('somehash');
    });
  });
});
