-- Liste mails par AO : filtre user_id + tender_id
CREATE INDEX IF NOT EXISTS idx_emails_user_tender_id ON emails (user_id, tender_id) WHERE tender_id IS NOT NULL;
