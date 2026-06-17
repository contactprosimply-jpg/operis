-- Notifications v2 : priorité, lien mail, index
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES emails(id) ON DELETE CASCADE;

COMMENT ON COLUMN notifications.priority IS 'normal | important';
COMMENT ON COLUMN notifications.email_id IS 'Mail lié (nouveau mail, AO, réponse importante)';

CREATE INDEX IF NOT EXISTS notifications_user_priority_created
  ON notifications (user_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_email
  ON notifications (user_id, email_id)
  WHERE email_id IS NOT NULL;

-- Deadlines urgentes / AO détecté → important
UPDATE notifications
SET priority = 'important'
WHERE type IN ('deadline_urgent', 'ao_detected', 'important_reply', 'quote_received')
  AND priority = 'normal';
