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