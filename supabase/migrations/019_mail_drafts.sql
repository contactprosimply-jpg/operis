-- Brouillons serveur (composeur Operis, sync auto 30s)

CREATE TABLE IF NOT EXISTS mail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_address text DEFAULT '',
  cc text DEFAULT '',
  bcc text DEFAULT '',
  subject text DEFAULT '',
  body text DEFAULT '',
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_updated
  ON mail_drafts (user_id, updated_at DESC);

ALTER TABLE mail_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY mail_drafts_select_own ON mail_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY mail_drafts_insert_own ON mail_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY mail_drafts_update_own ON mail_drafts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY mail_drafts_delete_own ON mail_drafts
  FOR DELETE USING (auth.uid() = user_id);
