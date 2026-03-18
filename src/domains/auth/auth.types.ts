export interface ApiKey {
  id: string;
  keyHash: string;
  label: string;
  gameId: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyInput {
  label: string;
  gameId?: string;
}

/** Returned only at key creation time. rawKey is shown once, never persisted. */
export interface ApiKeyCreated {
  id: string;
  rawKey: string;
  label: string;
  gameId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}
