-- PJ mail PNG ignorées par l'utilisateur (logos signature, inline)
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS excluded_mail_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenders.excluded_mail_attachments IS
  'Liste [{ email_id, attachment_index }] — PNG non intégrés à l''AO';
