CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
  player_id UUID REFERENCES players(id) ON DELETE RESTRICT,
  event_type VARCHAR(50) NOT NULL
    CHECK (event_type IN ('basket', 'three_pointer', 'free_throw', 'foul', 'timeout', 'period_end', 'game_start', 'game_end', 'correction', 'substitution', 'turnover')),
  score_delta INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  period SMALLINT NOT NULL DEFAULT 1,
  clock VARCHAR(10),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: no updated_at, no deleted_at, never modified
COMMENT ON TABLE events IS 'Append-only game event log. Never update or delete rows. Corrections are new events of type correction.';
COMMENT ON COLUMN events.score_delta IS 'Points scored by this event. Negative for corrections that reverse points.';
COMMENT ON COLUMN events.metadata IS 'Flexible event-specific data. GIN-indexed for query efficiency.';

CREATE INDEX idx_events_game_id ON events(game_id);
CREATE INDEX idx_events_game_id_created_at ON events(game_id, created_at DESC);
CREATE INDEX idx_events_player_id ON events(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_events_metadata ON events USING GIN(metadata) WHERE metadata IS NOT NULL;
