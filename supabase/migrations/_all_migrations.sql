-- ============================================================
-- OPERIS — Schéma complet (49 migrations consolidées, encodage corrigé)
-- À exécuter UNE fois dans le SQL Editor du NOUVEAU projet EU.
-- ============================================================

-- RESET : repart d'un schéma public vide (efface la tentative partielle précédente).
-- Sans danger sur ce nouveau projet : il ne contient encore aucune donnée réelle.
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all   on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- ============================================================
-- OPERIS — Migration 001 : Initialisation complète
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type tender_status as enum (
  'nouveau',
  'en_cours',
  'urgence',
  'gagne',
  'perdu',
  'cloture'
);

create type consultation_status as enum (
  'en_attente',
  'envoye',
  'relance',
  'relance_2',
  'repondu',
  'refuse'
);

-- ============================================================
-- TABLE : profiles (extension auth.users)
-- ============================================================

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  company     text,
  role        text default 'user',
  created_at  timestamptz default now()
);

-- ============================================================
-- TABLE : tenders (Appels d'offres)
-- ============================================================

create table tenders (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles (id) on delete cascade,
  title         text not null,
  client        text not null,
  description   text,
  deadline      date,
  status        tender_status not null default 'nouveau',
  source_email_id uuid,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_tenders_user_id  on tenders (user_id);
create index idx_tenders_status   on tenders (status);
create index idx_tenders_deadline on tenders (deadline);

-- ============================================================
-- TABLE : suppliers (Fournisseurs)
-- ============================================================

create table suppliers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles (id) on delete cascade,
  name        text not null,
  email       text not null,
  phone       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, email)
);

create index idx_suppliers_user_id on suppliers (user_id);

-- ============================================================
-- TABLE : consultation_suppliers (Pivot AO <-> Fournisseur)
-- ============================================================

create table consultation_suppliers (
  id            uuid primary key default uuid_generate_v4(),
  tender_id     uuid not null references tenders   (id) on delete cascade,
  supplier_id   uuid not null references suppliers (id) on delete cascade,
  status        consultation_status not null default 'en_attente',
  last_sent_at  timestamptz,
  relaunch_count int not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (tender_id, supplier_id)
);

create index idx_cs_tender_id   on consultation_suppliers (tender_id);
create index idx_cs_supplier_id on consultation_suppliers (supplier_id);
create index idx_cs_status      on consultation_suppliers (status);

-- ============================================================
-- TABLE : quotes (Devis reçus)
-- ============================================================

create table quotes (
  id              uuid primary key default uuid_generate_v4(),
  tender_id       uuid not null references tenders   (id) on delete cascade,
  supplier_id     uuid not null references suppliers (id) on delete cascade,
  price_ht        numeric(12, 2),
  document_url    text,
  notes           text,
  received_at     timestamptz default now(),
  created_at      timestamptz default now()
);

create index idx_quotes_tender_id   on quotes (tender_id);
create index idx_quotes_supplier_id on quotes (supplier_id);

-- ============================================================
-- TABLE : emails (Boîte mail ingérée)
-- ============================================================

create table emails (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles (id) on delete cascade,
  message_id    text unique,
  subject       text,
  from_address  text,
  to_address    text,
  body_text     text,
  body_html     text,
  received_at   timestamptz,
  is_read       boolean default false,
  is_ao         boolean default false,
  ao_score      int default 0,
  tender_id     uuid references tenders (id) on delete set null,
  created_at    timestamptz default now()
);

create index idx_emails_user_id    on emails (user_id);
create index idx_emails_is_ao      on emails (is_ao);
create index idx_emails_tender_id  on emails (tender_id);
create index idx_emails_message_id on emails (message_id);

-- ============================================================
-- TABLE : email_logs (Historique envois sortants)
-- ============================================================

create table email_logs (
  id              uuid primary key default uuid_generate_v4(),
  tender_id       uuid references tenders   (id) on delete set null,
  supplier_id     uuid references suppliers (id) on delete set null,
  type            text not null,
  to_address      text not null,
  subject         text,
  body            text,
  sent_at         timestamptz default now(),
  success         boolean default true,
  error_message   text
);

create index idx_email_logs_tender_id   on email_logs (tender_id);
create index idx_email_logs_supplier_id on email_logs (supplier_id);

-- ============================================================
-- FONCTION : updated_at automatique
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tenders_updated_at
  before update on tenders
  for each row execute function set_updated_at();

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

create trigger trg_cs_updated_at
  before update on consultation_suppliers
  for each row execute function set_updated_at();

-- ============================================================
-- FONCTION : créer profile automatiquement à l'inscription
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- VUE : tender_stats
-- ============================================================

create or replace view tender_stats as
select
  t.id                                                        as tender_id,
  t.title,
  t.client,
  t.status,
  t.deadline,
  count(distinct cs.supplier_id)                             as nb_suppliers,
  count(distinct cs.supplier_id) filter (
    where cs.status = 'repondu'
  )                                                          as nb_responses,
  count(distinct cs.supplier_id) filter (
    where cs.status in ('relance', 'relance_2')
  )                                                          as nb_relaunched,
  count(distinct q.id)                                       as nb_quotes,
  min(q.price_ht)                                            as min_quote,
  max(q.price_ht)                                            as max_quote,
  t.deadline - current_date                                  as days_remaining
from tenders t
left join consultation_suppliers cs on cs.tender_id = t.id
left join quotes q                  on q.tender_id  = t.id
group by t.id;

-- ============================================================
-- RLS — Activer sur toutes les tables
-- ============================================================

alter table profiles                enable row level security;
alter table tenders                 enable row level security;
alter table suppliers               enable row level security;
alter table consultation_suppliers  enable row level security;
alter table quotes                  enable row level security;
alter table emails                  enable row level security;
alter table email_logs              enable row level security;
-- Pièces jointes mail + devis liés aux emails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES emails(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_selected boolean DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validated_by uuid;

CREATE INDEX IF NOT EXISTS idx_emails_has_attachments ON emails (user_id, has_attachments);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_quotes_source_email ON quotes (source_email_id);
-- Bucket Supabase Storage pour pièces jointes mail (Pro)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mail-attachments', 'mail-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 26214400;
-- Documents AO (pièces jointes envoyées / uploadées)
CREATE TABLE IF NOT EXISTS tender_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tender_id uuid NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text,
  size int DEFAULT 0,
  storage_path text NOT NULL,
  bucket text NOT NULL DEFAULT 'devis',
  source text NOT NULL DEFAULT 'upload',
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  email_log_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_documents_tender ON tender_documents(tender_id);
CREATE INDEX IF NOT EXISTS idx_tender_documents_user ON tender_documents(user_id);

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
-- OPERIS — Migration 005 : Table notifications + RLS
-- Exécuter dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references profiles(id) on delete cascade,
  type       text        not null,
  title      text        not null,
  message    text        not null,
  tender_id  uuid        references tenders(id) on delete cascade,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);
-- Comptes mail IMAP/SMTP par utilisateur
CREATE TABLE IF NOT EXISTS mail_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  imap_host     text DEFAULT 'mail.gandi.net',
  imap_port     int DEFAULT 993,
  imap_user     text NOT NULL,
  imap_pass     text NOT NULL,
  smtp_host     text DEFAULT 'mail.gandi.net',
  smtp_port     int DEFAULT 587,
  smtp_user     text,
  smtp_pass     text,
  is_active     boolean DEFAULT true,
  last_sync     timestamptz,
  last_sync_uid int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, imap_user)
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_user ON mail_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_active ON mail_accounts (is_active) WHERE is_active = true;

ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_accounts_select_own" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_insert_own" ON mail_accounts;
DROP POLICY IF EXISTS "mail_accounts_update_own" ON mail_accounts;

CREATE POLICY "mail_accounts_select_own" ON mail_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mail_accounts_insert_own" ON mail_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mail_accounts_update_own" ON mail_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS emails (realtime + accès client)
DROP POLICY IF EXISTS "emails_select_own" ON emails;
DROP POLICY IF EXISTS "emails_insert_own" ON emails;
DROP POLICY IF EXISTS "emails_update_own" ON emails;

CREATE POLICY "emails_select_own" ON emails
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "emails_insert_own" ON emails
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "emails_update_own" ON emails
  FOR UPDATE USING (auth.uid() = user_id);

-- Realtime sur la table emails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emails'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emails;
  END IF;
END $$;
-- Délier tous les emails des AO (liaisons automatiques erronées)
UPDATE emails SET tender_id = null WHERE tender_id IS NOT NULL;

-- Réponses devis : ne pas marquer comme AO entrant
UPDATE emails
SET is_ao = false, ao_score = 0
WHERE is_ao = true
  AND (
    body_text ILIKE '%notre offre%' OR
    body_text ILIKE '%ci-joint%devis%' OR
    body_text ILIKE '%ci joint%devis%' OR
    body_text ILIKE '%en réponse à %' OR
    body_text ILIKE '%en reponse a%' OR
    body_text ILIKE '%suite à votre%' OR
    body_text ILIKE '%suite a votre%' OR
    body_text ILIKE '%veuillez trouver%' OR
    body_text ILIKE '%notre proposition%' OR
    subject ILIKE '%devis n°%' OR
    subject ILIKE '%devis n%' OR
    subject ILIKE '%offre n°%' OR
    subject ILIKE '%chiffrage%' OR
    subject ILIKE '%ponuda%'
  );
-- AO créé depuis email : documents upload = dossier reçu (pas envoyé)
UPDATE tender_documents td
SET source = 'ao_request'
FROM tenders t
WHERE td.tender_id = t.id
  AND t.source_email_id IS NOT NULL
  AND td.source IN ('upload', 'outbound')
  AND td.source NOT IN ('consultation');
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
-- Colonnes métier fournisseurs (utilisées par l'UI et l'onboarding)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS language text;
-- Suivi du guide interactif (spotlight) après onboarding
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tour_done boolean DEFAULT false;

-- Comptes déjà actifs avant le guide : ne pas forcer le tuto au prochain login
UPDATE profiles
  SET tour_done = true
  WHERE onboarding_done IS NOT TRUE;
-- Operis v8 — Famille : agrégation mails + enrichissement vue mail

-- Origine membre (mails synchronisés depuis la boîte d'un membre de la Famille)
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS source_member_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_member_name text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'info')),
  ADD COLUMN IF NOT EXISTS labels jsonb DEFAULT '[]'::jsonb;

-- message_id unique par utilisateur (pas global — plusieurs membres peuvent recevoir le même mail)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key;
DROP INDEX IF EXISTS idx_emails_message_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_message_id
  ON emails (user_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_source_member ON emails (source_member_id);
CREATE INDEX IF NOT EXISTS idx_emails_priority ON emails (user_id, priority);

-- RLS : le chef de Famille peut lire les mails des membres
DROP POLICY IF EXISTS "emails_select_family_owner" ON emails;
CREATE POLICY "emails_select_family_owner" ON emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM organizations o
      JOIN organization_members om ON om.organization_id = o.id
      WHERE o.owner_id = auth.uid()
        AND om.user_id = emails.user_id
        AND om.user_id <> o.owner_id
    )
  );

DROP POLICY IF EXISTS "emails_update_family_owner" ON emails;
CREATE POLICY "emails_update_family_owner" ON emails
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM organizations o
      JOIN organization_members om ON om.organization_id = o.id
      WHERE o.owner_id = auth.uid()
        AND om.user_id = emails.user_id
    )
  );
-- URGENT : supprime la contrainte globale message_id (bloque sync multi-comptes / Famille)
-- À exécuter si erreur : duplicate key "emails_message_id_key"

ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_message_id_key;
DROP INDEX IF EXISTS idx_emails_message_id;
DROP INDEX IF EXISTS emails_message_id_key;

-- Unique par utilisateur (un même Message-ID peut exister pour 2 membres de la Famille)
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_message_id
  ON emails (user_id, message_id)
  WHERE message_id IS NOT NULL;
-- Liens d'invitation Famille (groupe)
CREATE TABLE IF NOT EXISTS organization_invites (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  created_by      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites (token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_org ON organization_invites (organization_id);

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

-- Service role (API admin) bypasses RLS ; politique lecture pour le propriétaire org
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organization_invites' AND policyname = 'org_owner_manage_invites'
  ) THEN
    CREATE POLICY org_owner_manage_invites ON organization_invites
      FOR ALL
      USING (
        organization_id IN (
          SELECT id FROM organizations WHERE owner_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT id FROM organizations WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;
-- Historique envois lié au compte utilisateur (dossier Envoyés)
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_user_sent
  ON email_logs (user_id, sent_at DESC);
-- Dossiers IMAP (inbox, sent, drafts, trash, spam) comme Thunderbird
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS mail_folder text DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS imap_uid integer,
  ADD COLUMN IF NOT EXISTS imap_mailbox text;

CREATE INDEX IF NOT EXISTS idx_emails_user_mail_folder
  ON emails (user_id, mail_folder, received_at DESC);

UPDATE emails SET mail_folder = 'inbox' WHERE mail_folder IS NULL;
-- Client mail pro : étoile, corbeille soft, dossiers personnalisés
-- Note : mail_folder = colonne "folder" (inbox|sent|drafts|trash|spam|custom)

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_folder text;

CREATE INDEX IF NOT EXISTS idx_emails_user_folder_active
  ON emails (user_id, mail_folder, deleted_at, received_at DESC);

ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS cached_imap_folders jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN emails.mail_folder IS 'inbox | sent | drafts | trash | spam | custom';
-- Brouillons serveur (composeur Operis, sync auto 30s)

CREATE TABLE IF NOT EXISTS mail_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_address text DEFAULT '',
  cc text DEFAULT '',
  bcc text DEFAULT '',
  subject text DEFAULT '',
  body text DEFAULT '',
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_updated
  ON mail_drafts (user_id, updated_at DESC);

ALTER TABLE mail_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY mail_drafts_select_own ON mail_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY mail_drafts_insert_own ON mail_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY mail_drafts_update_own ON mail_drafts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY mail_drafts_delete_own ON mail_drafts
  FOR DELETE USING (auth.uid() = user_id);
-- Alias `folder` = `mail_folder` (compat specs client mail)
-- La colonne utilisée par l'app est mail_folder (migration 017).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'emails' AND column_name = 'mail_folder'
  ) THEN
    ALTER TABLE emails ADD COLUMN mail_folder text DEFAULT 'inbox';
    UPDATE emails SET mail_folder = 'inbox' WHERE mail_folder IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN emails.mail_folder IS 'Dossier logique : inbox | sent | drafts | trash | spam | custom';
-- Étiquettes intelligentes : le champ source/autoReason est stocké
-- dans la colonne JSONB emails.labels (pas une colonne séparée).
-- Exemple : { "id": "repondu", "name": "Répondu", "color": "#4ade80", "source": "auto", "autoReason": "..." }

COMMENT ON COLUMN emails.labels IS 'JSON array of labels; each item may include source (manual|auto) and autoReason';
-- Liaison documents AO ↔ emails (pièces jointes mail)
ALTER TABLE tender_documents
  ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES emails(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tender_documents_email ON tender_documents(email_id);

COMMENT ON COLUMN tender_documents.source IS
  'upload | ao_request | inbound | outbound | consultation | mail_sent | mail_received | manual';
-- Contacts (autocomplétion type Thunderbird)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  company text,
  is_favorite boolean NOT NULL DEFAULT false,
  ao_ids uuid[] NOT NULL DEFAULT '{}',
  last_contacted_at timestamptz,
  email_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_favorite ON contacts(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(user_id, last_contacted_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_select_own ON contacts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY contacts_insert_own ON contacts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY contacts_update_own ON contacts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY contacts_delete_own ON contacts
  FOR DELETE USING (user_id = auth.uid());
-- Préférences messagerie, relances et étiquettes auto
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  relance_first_delay_days integer NOT NULL DEFAULT 3,
  relance_interval_days integer NOT NULL DEFAULT 2,
  relance_max_count integer NOT NULL DEFAULT 3,
  relance_working_days_only boolean NOT NULL DEFAULT true,
  relance_confirm_before_send boolean NOT NULL DEFAULT true,

  auto_labels_enabled boolean NOT NULL DEFAULT true,
  label_a_traiter_delay_hours integer NOT NULL DEFAULT 24,
  label_en_retard_delay_days integer NOT NULL DEFAULT 3,

  mail_signature text NOT NULL DEFAULT '',
  mail_signature_enabled boolean NOT NULL DEFAULT true,

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select_own ON user_settings;
DROP POLICY IF EXISTS user_settings_insert_own ON user_settings;
DROP POLICY IF EXISTS user_settings_update_own ON user_settings;

CREATE POLICY user_settings_select_own ON user_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_settings_insert_own ON user_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_settings_update_own ON user_settings
  FOR UPDATE USING (user_id = auth.uid());

-- Notifications (migration 005 peut être absente en prod)
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  message    text        NOT NULL,
  tender_id  uuid        REFERENCES tenders(id) ON DELETE CASCADE,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

-- Relances en attente de confirmation
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
-- Mots clés AO + colonnes détection / threading sur emails + seuil utilisateur

CREATE TABLE IF NOT EXISTS ao_keywords (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN (
    'detection', 'question', 'reponse', 'relance', 'refus', 'acceptation'
  )),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ao_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ao_keywords_select_all ON ao_keywords;
CREATE POLICY ao_keywords_select_all ON ao_keywords
  FOR SELECT USING (true);

-- Détection / threading sur emails
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_ao_related boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ao_detection_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ao_detection_category text,
  ADD COLUMN IF NOT EXISTS ao_detection_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS references_ids text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails (user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_ao_related ON emails (user_id, is_ao_related) WHERE is_ao_related = true;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ao_detection_threshold integer NOT NULL DEFAULT 5;

-- Mots clés par défaut
INSERT INTO ao_keywords (keyword, category, weight) VALUES
('appel d''offres', 'detection', 5),
('appel d offres', 'detection', 5),
('consultation', 'detection', 4),
('dossier de consultation', 'detection', 5),
('DCE', 'detection', 5),
('CCTP', 'detection', 5),
('CCAP', 'detection', 5),
('BPU', 'detection', 4),
('DQE', 'detection', 4),
('mémoire technique', 'detection', 4),
('offre de prix', 'detection', 4),
('devis', 'detection', 3),
('soumission', 'detection', 4),
('marché public', 'detection', 5),
('marché de travaux', 'detection', 5),
('candidature', 'detection', 3),
('remise des offres', 'detection', 5),
('date limite', 'detection', 3),
('tranche ferme', 'detection', 4),
('tranche conditionnelle', 'detection', 4),
('question', 'question', 3),
('demande de précision', 'question', 4),
('pouvez-vous préciser', 'question', 4),
('merci de confirmer', 'question', 4),
('quel est le délai', 'question', 3),
('avez-vous bien reçu', 'question', 3),
('suite à votre offre', 'question', 4),
('concernant votre devis', 'question', 4),
('suite à notre échange', 'reponse', 3),
('comme convenu', 'reponse', 3),
('faisant suite', 'reponse', 3),
('en réponse à ', 'reponse', 4),
('ci-joint', 'reponse', 2),
('veuillez trouver', 'reponse', 2),
('sans réponse de votre part', 'relance', 4),
('relance', 'relance', 4),
('nous n''avons pas reçu', 'relance', 4),
('nous vous relançons', 'relance', 5),
('toujours en attente', 'relance', 4),
('rappel', 'relance', 3),
('nous avons le regret', 'refus', 5),
('n''avons pas retenu', 'refus', 5),
('votre offre n''a pas été', 'refus', 5),
('infructueux', 'refus', 4),
('sans suite', 'refus', 4),
('ne donnera pas suite', 'refus', 5),
('offre moins disante', 'refus', 4),
('retenu', 'acceptation', 5),
('votre offre a été retenue', 'acceptation', 5),
('nous avons le plaisir', 'acceptation', 4),
('ordre de service', 'acceptation', 5),
('notification de marché', 'acceptation', 5),
('attributaire', 'acceptation', 5),
('bon de commande', 'acceptation', 4)
ON CONFLICT (keyword) DO NOTHING;
-- Soft-delete pour documents AO (nettoyage logos signature sans perte définitive)
ALTER TABLE tender_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tender_documents_active
  ON tender_documents (tender_id, deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN tender_documents.deleted_at IS
  'Soft-delete (ex. logos de signature filtrés) — NULL = actif';
-- PJ mail PNG ignorées par l'utilisateur (logos signature, inline)
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS excluded_mail_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenders.excluded_mail_attachments IS
  'Liste [{ email_id, attachment_index }] — PNG non intégrés à l''AO';
-- Historique des runs de sync mail (cron Vercel + monitoring)
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'error')),
  accounts_synced int NOT NULL DEFAULT 0,
  new_emails int NOT NULL DEFAULT 0,
  error_detail jsonb,
  duration_ms int
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_active ON sync_runs (started_at)
  WHERE finished_at IS NULL;

COMMENT ON TABLE sync_runs IS 'Runs cron sync mail cloud (Vercel)';
-- RLS owner-based (tenders, documents, devis) — requis pour isolation multi-utilisateur
ALTER TABLE tender_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenders_select_own ON tenders;
DROP POLICY IF EXISTS tenders_insert_own ON tenders;
DROP POLICY IF EXISTS tenders_update_own ON tenders;
DROP POLICY IF EXISTS tenders_delete_own ON tenders;

CREATE POLICY tenders_select_own ON tenders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY tenders_insert_own ON tenders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tenders_update_own ON tenders FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY tenders_delete_own ON tenders FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS tender_documents_select_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_insert_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_update_own ON tender_documents;
DROP POLICY IF EXISTS tender_documents_delete_own ON tender_documents;

CREATE POLICY tender_documents_select_own ON tender_documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY tender_documents_insert_own ON tender_documents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tender_documents_update_own ON tender_documents FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY tender_documents_delete_own ON tender_documents FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS quotes_select_own ON quotes;
DROP POLICY IF EXISTS quotes_insert_own ON quotes;

CREATE POLICY quotes_select_own ON quotes FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);

CREATE POLICY quotes_insert_own ON quotes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);
-- FIX MIGRATION : la table 'projects' était référencée par les RLS mais jamais créée
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES profiles (id) ON DELETE CASCADE,
  name        text,
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_own ON projects;
CREATE POLICY projects_own ON projects
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Abonnements Stripe par organisation (Famille)
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL UNIQUE REFERENCES organizations (id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'trialing',
  plan text CHECK (plan IS NULL OR plan IN ('pro', 'business')),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select_owner ON subscriptions;
CREATE POLICY subscriptions_select_owner ON subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = subscriptions.org_id AND o.owner_id = auth.uid()
    )
  );
-- Runs de sync mail manuelle (bouton utilisateur) en plus du cron cloud
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sync_runs_user_started
  ON sync_runs (user_id, started_at DESC)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN sync_runs.user_id IS 'NULL = run cron cloud ; non-null = sync manuelle utilisateur';
-- Progression sync initiale IMAP + bandeau bienvenue messagerie
ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS initial_sync_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backfill_cursor_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mailbox_total int NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mail_welcome_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mail_accounts.backfill_cursor_uid IS 'Sync initiale : UID le plus bas déjà couvert (descente depuis les UID max)';
COMMENT ON COLUMN mail_accounts.mailbox_total IS 'Nombre total de messages INBOX (dernière mesure IMAP)';
COMMENT ON COLUMN profiles.mail_welcome_seen IS 'Bandeau bienvenue messagerie fermé';

-- Comptes déjà synchronisés avant cette migration : ne pas relancer un backfill complet
UPDATE mail_accounts
SET initial_sync_complete = true
WHERE last_sync IS NOT NULL;
-- Sync IMAP dossier Envoyés : UID / UIDVALIDITY et backfill séparés de l'INBOX
ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS inbox_uidvalidity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_last_sync_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_uidvalidity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_initial_sync_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_backfill_cursor_uid int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_mailbox_total int NOT NULL DEFAULT 0;

COMMENT ON COLUMN mail_accounts.inbox_uidvalidity IS 'UIDVALIDITY IMAP INBOX (reset sync si changement)';
COMMENT ON COLUMN mail_accounts.sent_last_sync_uid IS 'Dernier UID synchronisé dans le dossier Envoyés IMAP';
COMMENT ON COLUMN mail_accounts.sent_uidvalidity IS 'UIDVALIDITY dossier Envoyés (reset sync si changement)';
COMMENT ON COLUMN mail_accounts.sent_backfill_cursor_uid IS 'Backfill Envoyés : UID le plus bas déjà couvert (descente depuis les UID max)';
COMMENT ON COLUMN mail_accounts.sent_mailbox_total IS 'Nombre total de messages dans le dossier Envoyés IMAP';

-- Comptes inbox déjà synchronisés : lancer le backfill Envoyés sans bloquer l'UI
UPDATE mail_accounts
SET sent_initial_sync_complete = false
WHERE initial_sync_complete = true;
-- En-têtes destinataires (To / Cc / Bcc) pour affichage type Thunderbird
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS cc_address text,
  ADD COLUMN IF NOT EXISTS bcc_address text;

COMMENT ON COLUMN emails.cc_address IS 'Destinataires Cc (liste formatée)';
COMMENT ON COLUMN emails.bcc_address IS 'Destinataires Bcc (mails envoyés)';
-- Notifications v2 : priorité, lien mail, index
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES emails(id) ON DELETE CASCADE;

COMMENT ON COLUMN notifications.priority IS 'normal | important';
COMMENT ON COLUMN notifications.email_id IS 'Mail lié (nouveau mail, AO, réponse importante)';

CREATE INDEX IF NOT EXISTS notifications_user_priority_created
  ON notifications (user_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_email
  ON notifications (user_id, email_id)
  WHERE email_id IS NOT NULL;

-- Deadlines urgentes / AO détecté → important
UPDATE notifications
SET priority = 'important'
WHERE type IN ('deadline_urgent', 'ao_detected', 'important_reply', 'quote_received')
  AND priority = 'normal';
-- Veto comptable AO + preuve acceptation CGU + index favoris mails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ao_excluded_reason text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_version text DEFAULT '1.0';

CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails (user_id, is_starred) WHERE is_starred = true;
-- Copier l'acceptation CGU depuis les métadonnées Supabase Auth à la création du profil
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, terms_accepted_at, terms_version)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    NULLIF(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    COALESCE(new.raw_user_meta_data->>'terms_version', '1.0')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- État de synchro IMAP reprenable (curseur + progression UI)
CREATE TABLE IF NOT EXISTS mail_sync_state (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cursor         bigint,
  processed      int NOT NULL DEFAULT 0,
  total          int NOT NULL DEFAULT 0,
  phase          text,
  session_stored int NOT NULL DEFAULT 0,
  last_sync_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mail_sync_state_own" ON mail_sync_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE mail_sync_state IS 'Curseur et progression de la synchro IMAP par lot (reprise après coupure)';
-- Delta sync : colonne updated_at + index pour pull incrémental
alter table emails add column if not exists updated_at timestamptz not null default now();

update emails
set updated_at = coalesce(received_at, created_at, now())
where updated_at is null or updated_at = '1970-01-01 00:00:00+00'::timestamptz;

create index if not exists idx_emails_user_updated on emails (user_id, updated_at);

create or replace function touch_emails_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_emails_touch on emails;
create trigger trg_emails_touch before update on emails
  for each row execute function touch_emails_updated_at();
-- Liste mails par AO : filtre user_id + tender_id
CREATE INDEX IF NOT EXISTS idx_emails_user_tender_id ON emails (user_id, tender_id) WHERE tender_id IS NOT NULL;
-- Bucket public pour les installateurs Operis (fichiers .exe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desktop-releases',
  'desktop-releases',
  false,
  524288000,
  ARRAY['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable']
)
ON CONFLICT (id) DO NOTHING;
-- Aligne handle_new_user() sur la version durcie déjà en prod (patchée hors migration) :
-- search_path fixe (évite l'échec de résolution de `profiles` selon le contexte d'appel du trigger auth.users),
-- on conflict pour tolérer un profil déjà existant, et un handler d'exception pour ne jamais
-- faire échouer la création du compte auth si l'insert dans profiles échoue.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, terms_accepted_at, terms_version)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    coalesce(new.raw_user_meta_data->>'terms_version', '1.0')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- ne jamais bloquer la création du compte si profiles échoue
    return new;
end;
$function$;
-- Bucket Supabase Storage pour les documents AO (devis, plans, pièces jointes tender_documents).
-- Ce bucket n'a jamais été créé par migration (uniquement le référencement en base via
-- tender_documents.bucket) — absent aussi bien en prod qu'en dev, d'où l'échec systématique
-- de l'upload de documents sur une fiche AO ("erreur lors de l'ajout d'un document").
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('devis', 'devis', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800;
-- Chemin local/réseau du dossier chantier (saisi manuellement par l'utilisateur), ouvert
-- depuis l'app desktop (Electron) via un bouton dédié sur la fiche AO.
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS local_folder_path text DEFAULT NULL;
-- Liste noire d'expéditeurs par utilisateur : les mails reçus de ces adresses sont
-- automatiquement routés vers Indésirables dès la synchro IMAP, même si le serveur mail
-- les a laissés passer en INBOX.
CREATE TABLE IF NOT EXISTS blocked_senders (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  sender     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sender)
);

CREATE INDEX IF NOT EXISTS idx_blocked_senders_user ON blocked_senders (user_id);

ALTER TABLE blocked_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_senders_own ON blocked_senders;
CREATE POLICY blocked_senders_own ON blocked_senders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Vérification anti-bot au premier contact : le vrai message est mis en attente et un
-- email intermédiaire ("cliquez pour recevoir") est envoyé au destinataire. Le message réel
-- n'est délivré qu'après clic sur le lien de confirmation.
CREATE TABLE IF NOT EXISTS pending_mail_verifications (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  to_address   text NOT NULL,
  cc           text,
  bcc          text,
  subject      text NOT NULL,
  body_text    text NOT NULL,
  body_html    text NOT NULL,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  tender_id    uuid REFERENCES tenders (id) ON DELETE SET NULL,
  supplier_id  uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  verified_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_mail_verifications_user ON pending_mail_verifications (user_id);

ALTER TABLE pending_mail_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_mail_verifications_own ON pending_mail_verifications;
CREATE POLICY pending_mail_verifications_own ON pending_mail_verifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Indicateur "je suis le client de ce dossier" (pas d'intermédiaire) — coché à la création,
-- affiché en badge sur la fiche AO. Purement informatif, ne change aucun comportement.
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS is_own_client boolean NOT NULL DEFAULT false;