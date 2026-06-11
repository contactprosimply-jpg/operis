-- Client mail pro : étoile, corbeille soft, dossiers personnalisés
-- Note : mail_folder = colonne "folder" (inbox|sent|drafts|trash|spam|custom)

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_folder text;

CREATE INDEX IF NOT EXISTS idx_emails_user_folder_active
  ON emails (user_id, mail_folder, deleted_at, received_at DESC);

ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS cached_imap_folders jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN emails.mail_folder IS 'inbox | sent | drafts | trash | spam | custom';
