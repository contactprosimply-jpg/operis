-- Étiquettes intelligentes : le champ source/autoReason est stocké
-- dans la colonne JSONB emails.labels (pas une colonne séparée).
-- Exemple : { "id": "repondu", "name": "Répondu", "color": "#4ade80", "source": "auto", "autoReason": "..." }

COMMENT ON COLUMN emails.labels IS 'JSON array of labels; each item may include source (manual|auto) and autoReason';
