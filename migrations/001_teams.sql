CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_teams_abbreviation
  ON teams (abbreviation)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE teams IS 'Sports teams. Soft-deleted via deleted_at.';
