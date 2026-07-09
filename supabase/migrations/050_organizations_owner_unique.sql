-- Un utilisateur ne doit posséder qu'un seul groupe de facturation. Empêche une course
-- (double-clic sur "Choisir cette offre", requêtes concurrentes) de créer deux organisations
-- pour le même owner_id, ce qui désynchroniserait l'abonnement payé de l'org réellement lue
-- par /api/billing/status.
ALTER TABLE organizations ADD CONSTRAINT organizations_owner_id_unique UNIQUE (owner_id);
