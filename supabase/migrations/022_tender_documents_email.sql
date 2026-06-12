-- Liaison documents AO ↔ emails (pièces jointes mail)
ALTER TABLE tender_documents
  ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES emails(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tender_documents_email ON tender_documents(email_id);

COMMENT ON COLUMN tender_documents.source IS
  'upload | ao_request | inbound | outbound | consultation | mail_sent | mail_received | manual';
