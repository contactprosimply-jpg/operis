-- Phase 2 (audit sécurité) : compteur de stockage persistant par organisation, au lieu
-- d'un calcul à la volée. Ne couvre que les documents/devis (tender_documents) — les
-- pièces jointes mail restent comptées à la volée côté app (sum_email_attachment_bytes,
-- migration 055) pour éviter un trigger coûteux sur la table `emails`, à fort volume
-- d'écriture (sync IMAP).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS storage_quota_bytes bigint NOT NULL DEFAULT 0;

-- Organisation (propriétaire OU membre) d'un utilisateur — la même règle que
-- src/lib/organization.ts : un propriétaire est prioritaire sur une appartenance membre.
CREATE OR REPLACE FUNCTION resolve_org_for_user(target_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT id FROM organizations WHERE owner_id = target_user_id ORDER BY created_at DESC LIMIT 1),
    (SELECT organization_id FROM organization_members WHERE user_id = target_user_id LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION tender_documents_storage_delta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_org uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      target_org := resolve_org_for_user(NEW.user_id);
      IF target_org IS NOT NULL THEN
        UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes + COALESCE(NEW.size, 0)) WHERE id = target_org;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      target_org := resolve_org_for_user(OLD.user_id);
      IF target_org IS NOT NULL THEN
        UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.size, 0)) WHERE id = target_org;
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft-delete (deleted_at devient non-null) = décrément ; restauration = incrément.
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      target_org := resolve_org_for_user(NEW.user_id);
      IF target_org IS NOT NULL THEN
        UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.size, 0)) WHERE id = target_org;
      END IF;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      target_org := resolve_org_for_user(NEW.user_id);
      IF target_org IS NOT NULL THEN
        UPDATE organizations SET storage_used_bytes = GREATEST(0, storage_used_bytes + COALESCE(NEW.size, 0)) WHERE id = target_org;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tender_documents_storage_delta ON tender_documents;
CREATE TRIGGER trg_tender_documents_storage_delta
AFTER INSERT OR UPDATE OR DELETE ON tender_documents
FOR EACH ROW EXECUTE FUNCTION tender_documents_storage_delta();

-- Backfill : valeurs de départ correctes pour les données déjà existantes.
UPDATE organizations o
SET storage_used_bytes = COALESCE((
  SELECT SUM(td.size)
  FROM tender_documents td
  WHERE td.deleted_at IS NULL
    AND (
      td.user_id = o.owner_id
      OR td.user_id IN (SELECT user_id FROM organization_members WHERE organization_id = o.id)
    )
), 0);

UPDATE organizations o
SET storage_quota_bytes = CASE
  WHEN s.plan = 'business' THEN (50 + COALESCE(s.storage_addon_units, 0) * 10) * 1073741824::bigint
  WHEN s.plan = 'pro' THEN (20 + COALESCE(s.storage_addon_units, 0) * 10) * 1073741824::bigint
  ELSE 0
END
FROM subscriptions s
WHERE s.org_id = o.id;
