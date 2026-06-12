-- Contacts (autocomplétion type Thunderbird)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  company text,
  is_favorite boolean NOT NULL DEFAULT false,
  ao_ids uuid[] NOT NULL DEFAULT '{}',
  last_contacted_at timestamptz,
  email_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_favorite ON contacts(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(user_id, last_contacted_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_select_own ON contacts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY contacts_insert_own ON contacts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY contacts_update_own ON contacts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY contacts_delete_own ON contacts
  FOR DELETE USING (user_id = auth.uid());
