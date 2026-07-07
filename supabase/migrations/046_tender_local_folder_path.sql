-- Chemin local/réseau du dossier chantier (saisi manuellement par l'utilisateur), ouvert
-- depuis l'app desktop (Electron) via un bouton dédié sur la fiche AO.
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS local_folder_path text DEFAULT NULL;
