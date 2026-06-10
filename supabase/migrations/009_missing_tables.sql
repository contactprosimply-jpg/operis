-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member',
  display_name text,
  email text,
  color text default '#3b7ef6',
  created_at timestamptz default now(),
  unique(organization_id, user_id)
);

-- Colonnes manquantes tenders
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS budget_ht numeric(14,2),
  ADD COLUMN IF NOT EXISTS zone_geo text,
  ADD COLUMN IF NOT EXISTS maitre_ouvrage text,
  ADD COLUMN IF NOT EXISTS notes_internes text,
  ADD COLUMN IF NOT EXISTS priorite text DEFAULT 'normale',
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS simply_chantier_id uuid;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_done boolean DEFAULT false;

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_access" ON organizations;
CREATE POLICY "owner_access" ON organizations FOR ALL USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "member_access" ON organization_members;
CREATE POLICY "member_access" ON organization_members FOR ALL USING (user_id = auth.uid());

-- Recréer la vue tender_stats avec les nouveaux champs
DROP VIEW IF EXISTS tender_stats;
CREATE VIEW tender_stats AS
SELECT
  t.id AS tender_id,
  t.user_id,
  t.title,
  t.client,
  t.status,
  t.deadline,
  t.budget_ht,
  t.zone_geo,
  t.maitre_ouvrage,
  t.priorite,
  t.assigned_to,
  t.notes_internes,
  t.simply_chantier_id,
  t.created_at,
  t.updated_at,
  count(distinct cs.supplier_id) as nb_suppliers,
  count(distinct cs.supplier_id) filter (where cs.status = 'repondu') as nb_responses,
  count(distinct q.id) as nb_quotes,
  min(q.price_ht) as min_quote,
  max(q.price_ht) as max_quote,
  t.deadline - current_date as days_remaining
FROM tenders t
LEFT JOIN consultation_suppliers cs ON cs.tender_id = t.id
LEFT JOIN quotes q ON q.tender_id = t.id
GROUP BY t.id;
