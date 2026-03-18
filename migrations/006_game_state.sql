-- Adds a JSONB column to store live game state managed by the coach:
-- clock anchor, shot clock, fouls, timeouts, and period.
-- Nullable — NULL indicates no state has been pushed yet.
-- Updated via PATCH /games/:id/state using a JSON merge (||) so partial
-- patches are safe and do not overwrite untouched fields.
ALTER TABLE games ADD COLUMN state JSONB;
