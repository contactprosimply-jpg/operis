-- Permet d'enregistrer plusieurs adresses email pour un même fournisseur.
-- `email` reste l'adresse principale (inchangée, utilisée pour la détection anti-bot
-- et la correspondance email→fournisseur) ; `additional_emails` s'ajoute en copie "à"
-- lors de l'envoi des consultations/relances automatiques.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS additional_emails text[] NOT NULL DEFAULT '{}';
