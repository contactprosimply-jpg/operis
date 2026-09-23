-- Corps d'état (nomenclature BTP) — table de référence, pas un enum Postgres,
-- pour pouvoir ajouter/renommer une valeur plus tard sans migration lourde.
CREATE TABLE corps_etats (
  id text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO corps_etats (id, label, sort_order) VALUES
  ('gros_oeuvre', 'Gros œuvre / Maçonnerie', 10),
  ('terrassement_vrd', 'Terrassement / VRD', 20),
  ('charpente', 'Charpente', 30),
  ('couverture_etancheite', 'Couverture / Étanchéité', 40),
  ('menuiseries_exterieures', 'Menuiseries extérieures', 50),
  ('menuiseries_interieures', 'Menuiseries intérieures', 60),
  ('serrurerie_metallerie', 'Serrurerie / Métallerie', 70),
  ('platrerie_isolation', 'Plâtrerie / Isolation / Faux plafonds', 80),
  ('peinture_revetements_muraux', 'Peinture / Revêtements muraux', 90),
  ('carrelage_revetements_sols', 'Carrelage / Revêtements de sols', 100),
  ('electricite', 'Électricité', 110),
  ('plomberie_sanitaire', 'Plomberie / Sanitaire', 120),
  ('cvc', 'Chauffage / Ventilation / Climatisation', 130),
  ('ascenseurs', 'Ascenseurs / Monte-charges', 140),
  ('espaces_verts', 'Espaces verts', 150),
  ('autre', 'Autre', 999);

-- L'ancien champ texte libre "spécialité" est conservé tel quel (aucune donnée perdue),
-- simplement renommé : c'est désormais une note, la classification structurée se fait
-- via supplier_corps_etats ci-dessous.
ALTER TABLE suppliers RENAME COLUMN specialty TO specialty_note;
COMMENT ON COLUMN suppliers.specialty_note IS 'Ancienne "spécialité" en texte libre, conservée en note après passage à corps_etats (classification structurée)';

CREATE TABLE supplier_corps_etats (
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  corps_etat_id text NOT NULL REFERENCES corps_etats(id),
  PRIMARY KEY (supplier_id, corps_etat_id)
);

CREATE TABLE tender_corps_etats (
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  corps_etat_id text NOT NULL REFERENCES corps_etats(id),
  PRIMARY KEY (tender_id, corps_etat_id)
);

CREATE INDEX supplier_corps_etats_corps_etat_idx ON supplier_corps_etats(corps_etat_id);
CREATE INDEX tender_corps_etats_corps_etat_idx ON tender_corps_etats(corps_etat_id);

ALTER TABLE corps_etats ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_corps_etats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_corps_etats ENABLE ROW LEVEL SECURITY;

-- Table de référence globale, en lecture pour tout utilisateur authentifié — écriture
-- réservée au service role (migrations), pas de policy INSERT/UPDATE/DELETE côté client.
CREATE POLICY corps_etats_select_all ON corps_etats FOR SELECT TO authenticated USING (true);

CREATE POLICY supplier_corps_etats_select_own ON supplier_corps_etats FOR SELECT USING (
  EXISTS (SELECT 1 FROM suppliers s WHERE s.id = supplier_corps_etats.supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY supplier_corps_etats_insert_own ON supplier_corps_etats FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM suppliers s WHERE s.id = supplier_corps_etats.supplier_id AND s.user_id = auth.uid())
);
CREATE POLICY supplier_corps_etats_delete_own ON supplier_corps_etats FOR DELETE USING (
  EXISTS (SELECT 1 FROM suppliers s WHERE s.id = supplier_corps_etats.supplier_id AND s.user_id = auth.uid())
);

CREATE POLICY tender_corps_etats_select_own ON tender_corps_etats FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = tender_corps_etats.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY tender_corps_etats_insert_own ON tender_corps_etats FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = tender_corps_etats.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY tender_corps_etats_delete_own ON tender_corps_etats FOR DELETE USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = tender_corps_etats.tender_id AND t.user_id = auth.uid())
);
