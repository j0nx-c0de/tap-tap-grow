-- Every dashboard metric query filters events by type + a created_at range,
-- either across all businesses or scoped to one — these cover both access
-- patterns. Safe to run against data you already have (CREATE INDEX only,
-- no column/table changes).

CREATE INDEX IF NOT EXISTS events_type_created_at_idx ON events (type, created_at);
CREATE INDEX IF NOT EXISTS events_business_type_created_at_idx ON events (business_id, type, created_at);
