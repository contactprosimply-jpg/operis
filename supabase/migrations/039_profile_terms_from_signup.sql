-- Copier l'acceptation CGU depuis les métadonnées Supabase Auth à la création du profil
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, terms_accepted_at, terms_version)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    NULLIF(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
    COALESCE(new.raw_user_meta_data->>'terms_version', '1.0')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
