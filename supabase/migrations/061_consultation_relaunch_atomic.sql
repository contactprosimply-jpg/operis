-- ============================================================
-- 061_consultation_relaunch_atomic.sql
-- Incrément atomique de relaunch_count — corrige une race condition trouvée lors du
-- crash test : la lecture-puis-écriture côté TS (lire relaunch_count, calculer +1, écrire)
-- perdait des relances sous requêtes concurrentes (8 appels simultanés → seulement 4
-- comptabilisés). Un seul UPDATE, verrouillage de ligne Postgres = jamais de perte.
--
-- Volontairement PAS de vérification d'appartenance ici (tender_id/supplier_id ne sont
-- pas validés contre un organisation_id) — cette fonction n'est appelée que côté serveur
-- via le client admin (service_role), APRÈS que tender.service.ts a déjà vérifié l'accès.
-- Ne doit jamais être exposée directement à anon/authenticated.
-- ============================================================

create or replace function public.increment_consultation_relaunch(
  p_tender_id uuid,
  p_supplier_id uuid
)
returns public.consultation_suppliers
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.consultation_suppliers;
begin
  update public.consultation_suppliers
  set relaunch_count = coalesce(relaunch_count, 0) + 1,
      status = case
        when coalesce(relaunch_count, 0) + 1 >= 2 then 'relance_2'::public.consultation_status
        else 'relance'::public.consultation_status
      end,
      last_sent_at = now(),
      updated_at = now()
  where tender_id = p_tender_id and supplier_id = p_supplier_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.increment_consultation_relaunch(uuid, uuid) from public;
revoke all on function public.increment_consultation_relaunch(uuid, uuid) from anon;
revoke all on function public.increment_consultation_relaunch(uuid, uuid) from authenticated;
