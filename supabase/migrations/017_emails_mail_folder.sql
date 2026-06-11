-- Dossiers IMAP (inbox, sent, drafts, trash, spam) comme Thunderbird
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS mail_folder text DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS imap_uid integer,
  ADD COLUMN IF NOT EXISTS imap_mailbox text;

CREATE INDEX IF NOT EXISTS idx_emails_user_mail_folder
  ON emails (user_id, mail_folder, received_at DESC);

UPDATE emails SET mail_folder = 'inbox' WHERE mail_folder IS NULL;
