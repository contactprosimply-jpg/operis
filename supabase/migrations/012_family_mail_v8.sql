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
