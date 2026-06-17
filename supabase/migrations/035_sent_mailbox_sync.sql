-- Sync IMAP dossier Envoyés : UID / UIDVALIDITY et backfill séparés de l'INBOX
ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS inbox_uidvalidity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_last_sync_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_uidvalidity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_initial_sync_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_backfill_cursor_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_mailbox_total int NOT NULL DEFAULT 0;

COMMENT ON COLUMN mail_accounts.inbox_uidvalidity IS 'UIDVALIDITY IMAP INBOX (reset sync si changement)';
COMMENT ON COLUMN mail_accounts.sent_last_sync_uid IS 'Dernier UID synchronisé dans le dossier Envoyés IMAP';
COMMENT ON COLUMN mail_accounts.sent_uidvalidity IS 'UIDVALIDITY dossier Envoyés (reset sync si changement)';
COMMENT ON COLUMN mail_accounts.sent_backfill_cursor_uid IS 'Backfill Envoyés : UID le plus bas déjà couvert (descente depuis les UID max)';
COMMENT ON COLUMN mail_accounts.sent_mailbox_total IS 'Nombre total de messages dans le dossier Envoyés IMAP';

-- Comptes inbox déjà synchronisés : lancer le backfill Envoyés sans bloquer l'UI
UPDATE mail_accounts
SET sent_initial_sync_complete = false
WHERE initial_sync_complete = true;
