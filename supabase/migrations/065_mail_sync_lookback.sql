-- Profondeur de l'import initial de la messagerie IMAP : nombre de mois d'historique importés
-- à la première connexion d'un compte (INBOX + Envoyés). 0 = tout l'historique (comportement
-- d'origine). N'a aucun effet sur les mails déjà importés : rien n'est supprimé.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS mail_sync_lookback_months integer NOT NULL DEFAULT 12
  CHECK (mail_sync_lookback_months BETWEEN 0 AND 120);

COMMENT ON COLUMN user_settings.mail_sync_lookback_months IS 'Mois d''historique importés à la première synchro IMAP (0 = illimité, défaut 12)';
