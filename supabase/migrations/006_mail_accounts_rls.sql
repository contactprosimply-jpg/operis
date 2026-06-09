-- Comptes mail IMAP/SMTP par utilisateur
CREATE TABLE IF NOT EXISTS mail_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  imap_host     text DEFAULT 'mail.gandi.net',
  imap_port     int DEFAULT 993,
  imap_user     text NOT NULL,
  imap_pass     text NOT NULL,
  smtp_host     text DEFAULT 'mail.gandi.net',
  smtp_port     int DEFAULT 587,
  smtp_user     text,
  smtp_pass     text,
  is_active     boolean DEFAULT true,
  last_sync     timestamptz,
  last_sync_uid int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, imap_user)
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_user ON mail_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_active ON mail_accounts (is_active) WHERE is_active = true;

ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_accounts_select_own" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_insert_own" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_update_own" ON mail_accounts;

CREATE POLICY "mail_accounts_select_own" ON mail_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mail_accounts_insert_own" ON mail_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mail_accounts_update_own" ON mail_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS emails (realtime + accès client)
DROP POLICY IF EXISTS "emails_select_own" ON emails;
DROP POLICY IF EXISTS "emails_insert_own" ON emails;
DROP POLICY IF EXISTS "emails_update_own" ON emails;

CREATE POLICY "emails_select_own" ON emails
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "emails_insert_own" ON emails
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "emails_update_own" ON emails
  FOR UPDATE USING (auth.uid() = user_id);

-- Realtime sur la table emails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emails;
  END IF;
END $$;
