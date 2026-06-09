-- Pièces jointes mail + devis liés aux emails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES emails(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_selected boolean DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validated_by uuid;

CREATE INDEX IF NOT EXISTS idx_emails_has_attachments ON emails (user_id, has_attachments);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_quotes_source_email ON quotes (source_email_id);
