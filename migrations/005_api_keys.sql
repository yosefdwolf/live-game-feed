CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_game_id ON api_keys(game_id) WHERE game_id IS NOT NULL;

COMMENT ON TABLE api_keys IS 'API key records. Raw key shown once at creation, never stored. key_hash is SHA-256 of raw key.';
COMMENT ON COLUMN api_keys.game_id IS 'NULL = admin key with full access. Non-null = scoped to this game only.';
COMMENT ON COLUMN api_keys.key_hash IS '[PII-adjacent] SHA-256 of the raw key. Never store or log the raw key.';
