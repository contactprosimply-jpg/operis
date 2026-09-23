-- Nom du contact chez le fournisseur (facultatif) — distinct du nom de l'entreprise.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name text;
COMMENT ON COLUMN suppliers.contact_name IS 'Nom de la personne à contacter chez le fournisseur (facultatif)';
