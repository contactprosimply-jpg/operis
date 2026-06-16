-- RLS owner-based (tenders, documents, devis) — requis pour isolation multi-utilisateur
ALTER TABLE tender_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenders_select_own ON tenders;
DROP POLICY IF EXISTS tenders_insert_own ON tenders;
DROP POLICY IF EXISTS tenders_update_own ON tenders;
DROP POLICY IF EXISTS tenders_delete_own ON tenders;

CREATE POLICY tenders_select_own ON tenders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY tenders_insert_own ON tenders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tenders_update_own ON tenders FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY tenders_delete_own ON tenders FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS tender_documents_select_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_insert_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_update_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_delete_own ON tender_documents;

CREATE POLICY tender_documents_select_own ON tender_documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY tender_documents_insert_own ON tender_documents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tender_documents_update_own ON tender_documents FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY tender_documents_delete_own ON tender_documents FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS quotes_select_own ON quotes;
DROP POLICY IF EXISTS quotes_insert_own ON quotes;

CREATE POLICY quotes_select_own ON quotes FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);

CREATE POLICY quotes_insert_own ON quotes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);
