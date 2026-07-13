-- Phase 2 (audit sécurité) : durcissement RLS.
--
-- 1) Aligne les policies mail sur src/lib/mail-access.ts (messagerie strictement
--    personnelle, jamais partagée avec la famille — pas même avec le propriétaire de
--    l'organisation). Ces policies permettaient une lecture/écriture directe via l'API
--    REST que le code applicatif interdit explicitement.
DROP POLICY IF EXISTS emails_select_family_owner ON emails;
DROP POLICY IF EXISTS emails_update_family_owner ON emails;

-- 2) Défense en profondeur : tables avec RLS activée mais aucune policy (deny-all
--    aujourd'hui pour tout rôle hors service_role — l'app ne s'appuie pas dessus, mais
--    ça ferme la porte à un futur bug applicatif qui utiliserait le client anon/authenticated).
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY suppliers_select_own ON suppliers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY suppliers_insert_own ON suppliers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY suppliers_update_own ON suppliers FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY suppliers_delete_own ON suppliers FOR DELETE USING (user_id = auth.uid());

CREATE POLICY consultation_suppliers_select_own ON consultation_suppliers FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = consultation_suppliers.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY consultation_suppliers_insert_own ON consultation_suppliers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = consultation_suppliers.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY consultation_suppliers_update_own ON consultation_suppliers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = consultation_suppliers.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY consultation_suppliers_delete_own ON consultation_suppliers FOR DELETE USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = consultation_suppliers.tender_id AND t.user_id = auth.uid())
);

CREATE POLICY email_logs_select_own ON email_logs FOR SELECT USING (user_id = auth.uid());

CREATE POLICY sync_runs_select_own ON sync_runs FOR SELECT USING (user_id = auth.uid());

-- 3) Policies manquantes signalées (couverture CRUD incomplète, non bloquant mais à
--    fermer par cohérence).
CREATE POLICY quotes_update_own ON quotes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY quotes_delete_own ON quotes FOR DELETE USING (
  EXISTS (SELECT 1 FROM tenders t WHERE t.id = quotes.tender_id AND t.user_id = auth.uid())
);
CREATE POLICY mail_accounts_delete_own ON mail_accounts FOR DELETE USING (user_id = auth.uid());

-- 4) tender_stats est une vue : sans security_invoker, elle s'exécute avec les droits de
--    son propriétaire au lieu de ceux de l'appelant — le RLS de `tenders` ne s'appliquerait
--    pas si elle était un jour exposée hors service_role.
ALTER VIEW tender_stats SET (security_invoker = true);

-- 5) Dette technique : `projects` avait été créée hors migration numérotée (seule
--    031_projects_rls.sql existe). IF NOT EXISTS = no-op en prod, capture juste le schéma.
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id),
  name text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
