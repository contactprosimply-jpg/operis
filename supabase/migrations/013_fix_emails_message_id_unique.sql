-- URGENT : supprime la contrainte globale message_id (bloque sync multi-comptes / Famille)
-- À exécuter si erreur : duplicate key "emails_message_id_key"

ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key;
DROP INDEX IF EXISTS idx_emails_message_id;
DROP INDEX IF EXISTS emails_message_id_key;

-- Unique par utilisateur (un même Message-ID peut exister pour 2 membres de la Famille)
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_message_id
  ON emails (user_id, message_id)
  WHERE message_id IS NOT NULL;
