-- Indicateur "je suis le client de ce dossier" (pas d'intermédiaire) — coché à la création,
-- affiché en badge sur la fiche AO. Purement informatif, ne change aucun comportement.
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS is_own_client boolean NOT NULL DEFAULT false;
