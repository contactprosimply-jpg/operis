-- État de synchro IMAP reprenable (curseur + progression UI)
CREATE TABLE IF NOT EXISTS mail_sync_state (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cursor         bigint,
  processed      int NOT NULL DEFAULT 0,
  total          int NOT NULL DEFAULT 0,
  phase          text,
  session_stored int NOT NULL DEFAULT 0,
  last_sync_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_sync_state_own" ON mail_sync_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE mail_sync_state IS 'Curseur et progression de la synchro IMAP par lot (reprise après coupure)';
