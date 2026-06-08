-- OPERIS — Migration 005 : Table notifications + RLS
-- Exécuter dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references profiles(id) on delete cascade,
  type       text        not null,
  title      text        not null,
  message    text        not null,
  tender_id  uuid        references tenders(id) on delete cascade,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);
