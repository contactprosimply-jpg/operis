-- ============================================================
-- Migration 058 : cloisonnement de tender_stats
-- ============================================================
--
-- DIAGNOSTIC : tender_stats est une VUE (CREATE VIEW dans 001_init, recréée dans 009).
-- On ne peut pas y appliquer ENABLE ROW LEVEL SECURITY directement.
-- Sans la propriété security_invoker, la vue s'exécute avec les droits de son créateur
-- (supabase_admin / postgres) et contourne le RLS de la table sous-jacente `tenders` :
-- un appel REST direct avec le rôle `authenticated` retourne TOUTES les lignes, tous
-- utilisateurs confondus. C'est la faille signalée.
--
-- AUDIT DEV (wnsaxptkzamhjxrqydbl, 2026-08-24) — deux problèmes trouvés en vérifiant
-- contre le schéma réel, qui rendaient la correction initialement prévue inopérante :
--
--   1. La policy tenders_select_org_owner telle que rédigée ne matchait JAMAIS : son
--      EXISTS lit organization_members pour trouver la ligne d'un AUTRE membre, mais
--      la seule policy de cette table (`member_access`) restreint chaque ligne à
--      `user_id = auth.uid()` — le owner ne peut donc pas lire la ligne d'un autre
--      membre, RLS bloque la sous-requête en silence (0 ligne, jamais d'erreur).
--
--   2. `consultation_suppliers` a RLS activé mais AUCUNE policy sur ce projet (confirmé
--      par l'advisor Supabase — 056_rls_hardening.sql, qui devait les créer, n'a jamais
--      été appliqué ici). Conséquence : dès que security_invoker=on s'applique,
--      tender_stats.nb_suppliers / nb_responses retombent à 0 pour TOUT LE MONDE, pas
--      seulement pour le cloisonnement — régression fonctionnelle, y compris pour le
--      propriétaire consultant ses propres tenders. `quotes_select_own` (029) existe
--      mais ne couvre que le cas "own", donc min_quote/max_quote/nb_quotes seraient
--      aussi faux pour un tender d'équipe vu par le owner.
--
-- CORRECTION :
-- 1. Activer security_invoker = true sur la vue → elle s'exécutera désormais avec les
--    droits du CALLER, donc le RLS de `tenders` sera respecté.
-- 2. Fonction SECURITY DEFINER is_org_owner_of_user() : vérifie l'appartenance
--    owner→member sans dépendre du RLS de organization_members (même principe que le
--    bypass RLS via client admin décrit dans CLAUDE.md "Access control pattern" /
--    src/lib/tender-access.ts, mais appliqué ici en SQL). search_path verrouillé à ''
--    et corps entièrement qualifié (public./auth.) pour éviter tout détournement de
--    search_path — c'est une fonction SECURITY DEFINER, donc une faille d'escalade
--    potentielle si le search_path n'est pas figé.
-- 3. Policy SELECT sur `tenders` qui étend la visibilité au niveau de l'organisation :
--    le propriétaire d'une org voit les tenders de tous ses membres. (Miroir SQL de
--    src/lib/tender-access.ts#getFamilyContext au niveau app.)
-- 4. Policies SELECT (uniquement — principe du moindre privilège : tender_stats ne fait
--    que lire) sur `consultation_suppliers` et `quotes`, étendues au même cas
--    "own OR org owner", pour que les agrégats de tender_stats soient corrects et
--    cloisonnés. Aucune policy INSERT/UPDATE/DELETE n'est touchée ici : ce n'est pas le
--    périmètre de cette migration (tender_stats ne fait que du SELECT) ; combler le
--    manque d'écriture sur consultation_suppliers est un sujet séparé si un besoin
--    applicatif réel se présente.
--
-- Hors périmètre (flag pour suivi séparé, pas traité ici) : `profiles`, `suppliers`,
-- `email_logs`, `sync_runs` ont le même symptôme (RLS activé, 0 policy) mais ne sont
-- pas référencés par tender_stats.
-- ============================================================

-- 1) Sécuriser la vue (idempotent)
ALTER VIEW public.tender_stats SET (security_invoker = true);

-- 2) Fonction utilitaire : l'appelant (auth.uid()) est-il owner de l'org dont
--    target_user_id est membre ? SECURITY DEFINER pour contourner le RLS de
--    organization_members (qui ne permet pas au owner de lire les lignes des autres
--    membres) — search_path verrouillé, corps entièrement qualifié.
CREATE OR REPLACE FUNCTION public.is_org_owner_of_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.organization_members om ON om.organization_id = o.id
    WHERE o.owner_id = auth.uid()
      AND om.user_id = target_user_id
  );
$$;

-- Sur ce projet Supabase, EXECUTE est accordé à anon/authenticated directement à la
-- création d'une fonction (pas via PUBLIC) — REVOKE ALL FROM public seul ne suffit
-- donc pas, il faut explicitement retirer anon (confirmé par l'advisor + pg_proc.proacl
-- après application sur DEV).
REVOKE ALL ON FUNCTION public.is_org_owner_of_user(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_org_owner_of_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner_of_user(uuid) TO authenticated;

-- 3) Cloisonnement organisationnel sur tenders (base de tender_stats)
--    Policy existante (029) : tenders_select_own → user_id = auth.uid()
--    Policy ajoutée ci-dessous : le propriétaire de l'org peut voir les tenders de
--    ses membres (déjà couvert pour sa propre ligne par tenders_select_own).
DROP POLICY IF EXISTS tenders_select_org_owner ON tenders;
CREATE POLICY tenders_select_org_owner ON tenders
  FOR SELECT USING (
    public.is_org_owner_of_user(tenders.user_id)
  );

-- 4) consultation_suppliers : aucune policy existante sur ce projet → SELECT own +
--    org owner (nécessaire pour que nb_suppliers/nb_responses ne retombent pas à 0
--    pour tout le monde une fois security_invoker=on). SELECT uniquement : voir
--    note de périmètre ci-dessus.
DROP POLICY IF EXISTS consultation_suppliers_select_own ON consultation_suppliers;
CREATE POLICY consultation_suppliers_select_own ON consultation_suppliers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenders t
      WHERE t.id = consultation_suppliers.tender_id
        AND (t.user_id = auth.uid() OR public.is_org_owner_of_user(t.user_id))
    )
  );

-- 5) quotes : étendre la visibilité SELECT au cas org-owner (cohérence des agrégats
--    min_quote/max_quote/nb_quotes dans tender_stats pour un tender d'équipe).
DROP POLICY IF EXISTS quotes_select_own ON quotes;
CREATE POLICY quotes_select_own ON quotes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenders t
      WHERE t.id = quotes.tender_id
        AND (t.user_id = auth.uid() OR public.is_org_owner_of_user(t.user_id))
    )
  );
