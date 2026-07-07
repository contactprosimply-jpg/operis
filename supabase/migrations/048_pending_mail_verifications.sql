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
