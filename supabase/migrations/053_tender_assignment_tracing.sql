-- Traçabilité de l'assignation d'un AO à un membre de la famille : qui a assigné,
-- et quand. Purement additif, ne change aucun comportement existant.
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES profiles(id);
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
