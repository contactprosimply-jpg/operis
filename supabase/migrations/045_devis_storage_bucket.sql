-- Bucket Supabase Storage pour les documents AO (devis, plans, pièces jointes tender_documents).
-- Ce bucket n'a jamais été créé par migration (uniquement le référencement en base via
-- tender_documents.bucket) — absent aussi bien en prod qu'en dev, d'où l'échec systématique
-- de l'upload de documents sur une fiche AO ("erreur lors de l'ajout d'un document").
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('devis', 'devis', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800;
