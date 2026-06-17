-- Progression sync initiale IMAP + bandeau bienvenue messagerie
ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS initial_sync_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backfill_cursor_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mailbox_total int NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mail_welcome_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mail_accounts.backfill_cursor_uid IS 'Sync initiale : UID le plus bas déjà couvert (descente depuis les UID max)';
COMMENT ON COLUMN mail_accounts.mailbox_total IS 'Nombre total de messages INBOX (dernière mesure IMAP)';
COMMENT ON COLUMN profiles.mail_welcome_seen IS 'Bandeau bienvenue messagerie fermé';

-- Comptes déjà synchronisés avant cette migration : ne pas relancer un backfill complet
UPDATE mail_accounts
SET initial_sync_complete = true
WHERE last_sync IS NOT NULL;
