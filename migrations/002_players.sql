CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  jersey_number SMALLINT NOT NULL CHECK (jersey_number >= 0 AND jersey_number <= 99),
  position VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_players_team_id ON players(team_id);

CREATE UNIQUE INDEX idx_players_team_jersey
  ON players (team_id, jersey_number)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE players IS 'Players belonging to a team. Soft-deleted via deleted_at.';
COMMENT ON COLUMN players.jersey_number IS 'Jersey number 0-99. Unique per team among active players.';
