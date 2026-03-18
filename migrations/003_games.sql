CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  away_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  sport VARCHAR(50) NOT NULL DEFAULT 'basketball',
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'final', 'cancelled')),
  home_score INTEGER NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score INTEGER NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  period SMALLINT NOT NULL DEFAULT 1 CHECK (period >= 1),
  clock VARCHAR(10) NOT NULL DEFAULT '10:00',
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_games_home_team_id ON games(home_team_id);
CREATE INDEX idx_games_away_team_id ON games(away_team_id);
CREATE INDEX idx_games_status ON games(status) WHERE deleted_at IS NULL;

COMMENT ON TABLE games IS 'A game between home and away teams. Scores are denormalized for O(1) reads; events table is authoritative history.';
COMMENT ON COLUMN games.status IS 'State machine: scheduled → active → final or cancelled. Enforced via CHECK constraint.';
COMMENT ON COLUMN games.home_score IS 'Denormalized current home score. Updated atomically with each scoring event.';
COMMENT ON COLUMN games.away_score IS 'Denormalized current away score. Updated atomically with each scoring event.';
