-- Généralise le "chemin de dossier local" (Electron uniquement) en "lien dossier"
-- utilisable depuis n'importe quel navigateur : URL https (cloud) ou chemin local/UNC
-- (copié dans le presse-papier, faute de pouvoir ouvrir file://\\... depuis une page https).
ALTER TABLE tenders RENAME COLUMN local_folder_path TO dossier_url;
