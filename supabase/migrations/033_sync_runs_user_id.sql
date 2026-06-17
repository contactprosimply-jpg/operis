-- Runs de sync mail manuelle (bouton utilisateur) en plus du cron cloud
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sync_runs_user_started
  ON sync_runs (user_id, started_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN sync_runs.user_id IS 'NULL = run cron cloud ; non-null = sync manuelle utilisateur';
