-- Delta sync : colonne updated_at + index pour pull incrémental
alter table emails add column if not exists updated_at timestamptz not null default now();

update emails
set updated_at = coalesce(received_at, created_at, now())
where updated_at is null or updated_at = '1970-01-01 00:00:00+00'::timestamptz;

create index if not exists idx_emails_user_updated on emails (user_id, updated_at);

create or replace function touch_emails_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_emails_touch on emails;
create trigger trg_emails_touch before update on emails
  for each row execute function touch_emails_updated_at();
