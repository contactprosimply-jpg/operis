-- Aligne handle_new_user() sur la version durcie déjà en prod (patchée hors migration) :
-- search_path fixe (évite l'échec de résolution de `profiles` selon le contexte d'appel du trigger auth.users),
-- on conflict pour tolérer un profil déjà existant, et un handler d'exception pour ne jamais
-- faire échouer la création du compte auth si l'insert dans profiles échoue.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, terms_accepted_at, terms_version)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    coalesce(new.raw_user_meta_data->>'terms_version', '1.0')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- ne jamais bloquer la création du compte si profiles échoue
    return new;
end;
$function$;
