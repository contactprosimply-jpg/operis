-- En-têtes destinataires (To / Cc / Bcc) pour affichage type Thunderbird
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS cc_address text,
  ADD COLUMN IF NOT EXISTS bcc_address text;

COMMENT ON COLUMN emails.cc_address IS 'Destinataires Cc (liste formatée)';
COMMENT ON COLUMN emails.bcc_address IS 'Destinataires Bcc (mails envoyés)';
