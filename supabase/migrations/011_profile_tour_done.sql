-- Suivi du guide interactif (spotlight) après onboarding
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tour_done boolean DEFAULT false;

-- Comptes déjà actifs avant le guide : ne pas forcer le tuto au prochain login
UPDATE profiles
  SET tour_done = true
  WHERE onboarding_done IS NOT TRUE;
