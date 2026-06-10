-- Délier tous les emails des AO (liaisons automatiques erronées)
UPDATE emails SET tender_id = null WHERE tender_id IS NOT NULL;

-- Réponses devis : ne pas marquer comme AO entrant
UPDATE emails
SET is_ao = false, ao_score = 0
WHERE is_ao = true
  AND (
    body_text ILIKE '%notre offre%' OR
    body_text ILIKE '%ci-joint%devis%' OR
    body_text ILIKE '%ci joint%devis%' OR
    body_text ILIKE '%en réponse à%' OR
    body_text ILIKE '%en reponse a%' OR
    body_text ILIKE '%suite à votre%' OR
    body_text ILIKE '%suite a votre%' OR
    body_text ILIKE '%veuillez trouver%' OR
    body_text ILIKE '%notre proposition%' OR
    subject ILIKE '%devis n°%' OR
    subject ILIKE '%devis n%' OR
    subject ILIKE '%offre n°%' OR
    subject ILIKE '%chiffrage%' OR
    subject ILIKE '%ponuda%'
  );
