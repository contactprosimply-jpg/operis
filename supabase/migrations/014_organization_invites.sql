-- Liens d'invitation Famille (groupe)
CREATE TABLE IF NOT EXISTS organization_invites (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  created_by      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites (token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_org ON organization_invites (organization_id);

ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;
