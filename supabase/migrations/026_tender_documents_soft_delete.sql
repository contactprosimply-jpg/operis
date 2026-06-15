-- Soft-delete pour documents AO (nettoyage logos signature sans perte définitive)
ALTER TABLE tender_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tender_documents_active
  ON tender_documents (tender_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN tender_documents.deleted_at IS
  'Soft-delete (ex. logos de signature filtrés) — NULL = actif';
