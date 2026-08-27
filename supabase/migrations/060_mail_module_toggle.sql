-- ============================================================
-- 060_mail_module_toggle.sql
-- Rend la messagerie intégrée optionnelle : réglage par utilisateur,
-- activé par défaut pour ne rien changer au comportement existant.
-- ============================================================

alter table user_settings
  add column if not exists mail_module_enabled boolean not null default true;
