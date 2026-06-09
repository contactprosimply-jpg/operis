-- Documents AO (pièces jointes envoyées / uploadées)
CREATE TABLE IF NOT EXISTS tender_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text,
  size int DEFAULT 0,
  storage_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'devis',
  source text NOT NULL DEFAULT 'upload',
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  email_log_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_documents_tender ON tender_documents(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_documents_user ON tender_documents(user_id);

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
