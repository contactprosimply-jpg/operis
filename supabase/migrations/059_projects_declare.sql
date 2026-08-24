-- ============================================================
-- Migration 059 : déclaration officielle de la table projects
-- ============================================================
--
-- CONTEXTE : la table `projects` a été créée directement dans _all_migrations.sql
-- (commentaire "FIX MIGRATION") sans jamais figurer dans un fichier numéroté.
-- La migration 031_projects_rls.sql active RLS mais suppose la table existante —
-- elle échoue donc sur un projet vierge où projects n'existe pas encore.
-- La migration 056_rls_hardening.sql crée la table (IF NOT EXISTS) mais sans
-- la contrainte ON DELETE CASCADE, sans index, et sans policy RLS.
--
-- Cette migration :
--   • crée la table si absente (no-op idempotent en prod où elle existe déjà) ;
--   • ajoute les colonnes manquantes avec ADD COLUMN IF NOT EXISTS (idempotent) ;
--   • active RLS (idempotent si déjà actif) ;
--   • crée la policy de cloisonnement par utilisateur (DROP + CREATE, idempotent).
--
-- Structure de référence vérifiée dans _all_migrations.sql (fix manuel appliqué
-- en prod) : id, user_id (FK profiles ON DELETE CASCADE), name, description,
-- created_at, updated_at. Aucun index existant → on en ajoute un sur user_id.
-- ============================================================

-- 1) Table (no-op si déjà existante)
CREATE TABLE IF NOT EXISTS public.projects (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text,
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 2) Colonnes (idempotent — si la table existait déjà sans l'une d'elles)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name        text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

-- 3) Index (manquant dans le fix manuel d'origine)
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);

-- 4) RLS (idempotent)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 5) Policy de cloisonnement : chaque utilisateur ne voit et ne modifie
--    que ses propres projets (colonne pivot réelle : user_id).
--    Couverture CRUD complète (FOR ALL).
DROP POLICY IF EXISTS projects_own ON public.projects;
CREATE POLICY projects_own ON public.projects
  FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
