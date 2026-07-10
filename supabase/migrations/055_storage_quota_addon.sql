-- Quota de stockage : add-on payant (Stripe) + prise en compte des pièces jointes mail
-- (jusqu'ici seuls les documents/devis uploadés manuellement comptaient, alors que les
-- pièces jointes IMAP consomment aussi le quota Supabase réel).

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS storage_addon_units integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sum_email_attachment_bytes(target_user_ids uuid[])
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM((elem->>'size')::bigint), 0)
  FROM emails, jsonb_array_elements(COALESCE(emails.attachments, '[]'::jsonb)) AS elem
  WHERE emails.user_id = ANY(target_user_ids)
    AND emails.deleted_at IS NULL
$$;
