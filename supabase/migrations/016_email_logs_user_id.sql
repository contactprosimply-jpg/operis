-- Historique envois lié au compte utilisateur (dossier Envoyés)
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_user_sent
  ON email_logs (user_id, sent_at DESC);
