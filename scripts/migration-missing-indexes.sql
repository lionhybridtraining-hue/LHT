-- Migration: Add missing indexes for strength log queries
-- Improves performance on session lookups and set queries by session/instance

-- 1. strength_log_sets — index on session_id (used by getStrengthLogSetsForSessions)
CREATE INDEX IF NOT EXISTS idx_strength_log_sets_session_id
  ON strength_log_sets(session_id);

-- 2. strength_log_sets — index on instance_id (future queries by instance)
CREATE INDEX IF NOT EXISTS idx_strength_log_sets_instance_id
  ON strength_log_sets(instance_id);

-- 3. strength_log_sessions — composite for findActiveStrengthSession & getStrengthSessionHistory
CREATE INDEX IF NOT EXISTS idx_strength_log_sessions_athlete_plan_status
  ON strength_log_sessions(athlete_id, plan_id, status);
