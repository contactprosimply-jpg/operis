-- Les documents importés manuellement (bouton "+ Ajouter un document") ne doivent plus
-- être classés dans "Envoyés" (bug : source par défaut = 'outbound'). On leur donne leur
-- propre classification 'manual_import' et on trace qui les a importés.
ALTER TABLE tender_documents ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES profiles(id);
