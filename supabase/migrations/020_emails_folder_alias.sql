-- Alias `folder` = `mail_folder` (compat specs client mail)
-- La colonne utilisée par l'app est mail_folder (migration 017).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'emails' AND column_name = 'mail_folder'
  ) THEN
    ALTER TABLE emails ADD COLUMN mail_folder text DEFAULT 'inbox';
    UPDATE emails SET mail_folder = 'inbox' WHERE mail_folder IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN emails.mail_folder IS 'Dossier logique : inbox | sent | drafts | trash | spam | custom';
