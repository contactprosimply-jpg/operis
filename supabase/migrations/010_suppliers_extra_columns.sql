-- Colonnes métier fournisseurs (utilisées par l'UI et l'onboarding)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS language text;
