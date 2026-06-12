-- Préférences messagerie, relances et étiquettes auto
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  relance_first_delay_days integer NOT NULL DEFAULT 3,
  relance_interval_days integer NOT NULL DEFAULT 2,
  relance_max_count integer NOT NULL DEFAULT 3,
  relance_working_days_only boolean NOT NULL DEFAULT true,
  relance_confirm_before_send boolean NOT NULL DEFAULT true,

  auto_labels_enabled boolean NOT NULL DEFAULT true,
  label_a_traiter_delay_hours integer NOT NULL DEFAULT 24,
  label_en_retard_delay_days integer NOT NULL DEFAULT 3,

  mail_signature text NOT NULL DEFAULT '',
  mail_signature_enabled boolean NOT NULL DEFAULT true,

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select_own ON user_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_settings_insert_own ON user_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_settings_update_own ON user_settings
  FOR UPDATE USING (user_id = auth.uid());

-- Relances en attente de confirmation
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
