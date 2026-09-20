-- ============================================================
-- 062_notifications_priorities.sql
-- « À traiter » (récap des priorités) et récap du matin par utilisateur.
--
-- 1) emails.handled_at : un mail important / une réponse fournisseur est « traité »
--    quand on y répond depuis Operis, qu'on valide le devis ou qu'on clique « traité ».
--    NULL = reste à traiter. Colonne facultative : sans elle la liste « À traiter »
--    reste simplement vide, rien d'autre ne casse.
-- 2) notification_settings : réglages du récap du matin (activé, heure choisie, dernier
--    envoi). Table à part, volontairement, pour ne pas toucher à user_settings dont
--    l'enregistrement est utilisé partout. Pas de ligne = valeurs par défaut (activé, 8h).
-- ============================================================

alter table public.emails
  add column if not exists handled_at timestamptz;

-- Les mails à traiter sont l'exception : index partiel, très petit.
create index if not exists emails_user_unhandled_idx
  on public.emails (user_id, received_at desc)
  where handled_at is null;

create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  digest_enabled boolean not null default true,
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  digest_last_sent_on date,
  updated_at timestamptz not null default now()
);

-- Accès uniquement via le client serveur (service_role) : RLS activée sans aucune policy
-- = refus total pour anon/authenticated.
alter table public.notification_settings enable row level security;
