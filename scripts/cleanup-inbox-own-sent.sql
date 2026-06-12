-- Nettoyage : mails envoyés mal classés en Courrier entrant
-- Remplacer les deux valeurs avant exécution dans Supabase SQL Editor.

DELETE FROM emails
WHERE mail_folder = 'inbox'
  AND from_address ILIKE '%TON_EMAIL_GANDI_ICI%'
  AND user_id = 'TON_USER_ID_ICI';

-- Variante : tout mail dont l'expéditeur est le compte IMAP (sans doublon message_id en sent)
-- DELETE FROM emails e
-- WHERE e.mail_folder = 'inbox'
--   AND e.user_id = 'TON_USER_ID_ICI'
--   AND EXISTS (
--     SELECT 1 FROM emails s
--     WHERE s.user_id = e.user_id
--       AND s.mail_folder = 'sent'
--       AND s.message_id = e.message_id
--   );
