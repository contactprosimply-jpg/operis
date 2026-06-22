-- Veto comptable AO + preuve acceptation CGU + index favoris mails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ao_excluded_reason text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_version text DEFAULT '1.0';

CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails (user_id, is_starred) WHERE is_starred = true;
