-- Liste noire d'expéditeurs par utilisateur : les mails reçus de ces adresses sont
-- automatiquement routés vers Indésirables dès la synchro IMAP, même si le serveur mail
-- les a laissés passer en INBOX.
CREATE TABLE IF NOT EXISTS blocked_senders (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  sender     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sender)
);

CREATE INDEX IF NOT EXISTS idx_blocked_senders_user ON blocked_senders (user_id);

ALTER TABLE blocked_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_senders_own ON blocked_senders;
CREATE POLICY blocked_senders_own ON blocked_senders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
