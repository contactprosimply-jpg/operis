-- AO créé depuis email : documents upload = dossier reçu (pas envoyé)
UPDATE tender_documents td
SET source = 'ao_request'
FROM tenders t
WHERE td.tender_id = t.id
  AND t.source_email_id IS NOT NULL
  AND td.source IN ('upload', 'outbound')
  AND td.source NOT IN ('consultation');
