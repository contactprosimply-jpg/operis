-- Historique des runs de sync mail (cron Vercel + monitoring)
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'error')),
  accounts_synced int NOT NULL DEFAULT 0,
  new_emails int NOT NULL DEFAULT 0,
  error_detail jsonb,
  duration_ms int
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_active ON sync_runs (started_at)
  WHERE finished_at IS NULL;

COMMENT ON TABLE sync_runs IS 'Runs cron sync mail cloud (Vercel)';
