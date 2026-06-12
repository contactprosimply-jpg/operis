-- Mots clés AO + colonnes détection / threading sur emails + seuil utilisateur

CREATE TABLE IF NOT EXISTS ao_keywords (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN (
    'detection', 'question', 'reponse', 'relance', 'refus', 'acceptation'
  )),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ao_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ao_keywords_select_all ON ao_keywords;
CREATE POLICY ao_keywords_select_all ON ao_keywords
  FOR SELECT USING (true);

-- Détection / threading sur emails
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_ao_related boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ao_detection_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ao_detection_category text,
  ADD COLUMN IF NOT EXISTS ao_detection_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS in_reply_to text,
  ADD COLUMN IF NOT EXISTS references_ids text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails (user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_ao_related ON emails (user_id, is_ao_related) WHERE is_ao_related = true;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ao_detection_threshold integer NOT NULL DEFAULT 5;

-- Mots clés par défaut
INSERT INTO ao_keywords (keyword, category, weight) VALUES
('appel d''offres', 'detection', 5),
('appel d offres', 'detection', 5),
('consultation', 'detection', 4),
('dossier de consultation', 'detection', 5),
('DCE', 'detection', 5),
('CCTP', 'detection', 5),
('CCAP', 'detection', 5),
('BPU', 'detection', 4),
('DQE', 'detection', 4),
('mémoire technique', 'detection', 4),
('offre de prix', 'detection', 4),
('devis', 'detection', 3),
('soumission', 'detection', 4),
('marché public', 'detection', 5),
('marché de travaux', 'detection', 5),
('candidature', 'detection', 3),
('remise des offres', 'detection', 5),
('date limite', 'detection', 3),
('tranche ferme', 'detection', 4),
('tranche conditionnelle', 'detection', 4),
('question', 'question', 3),
('demande de précision', 'question', 4),
('pouvez-vous préciser', 'question', 4),
('merci de confirmer', 'question', 4),
('quel est le délai', 'question', 3),
('avez-vous bien reçu', 'question', 3),
('suite à votre offre', 'question', 4),
('concernant votre devis', 'question', 4),
('suite à notre échange', 'reponse', 3),
('comme convenu', 'reponse', 3),
('faisant suite', 'reponse', 3),
('en réponse à', 'reponse', 4),
('ci-joint', 'reponse', 2),
('veuillez trouver', 'reponse', 2),
('sans réponse de votre part', 'relance', 4),
('relance', 'relance', 4),
('nous n''avons pas reçu', 'relance', 4),
('nous vous relançons', 'relance', 5),
('toujours en attente', 'relance', 4),
('rappel', 'relance', 3),
('nous avons le regret', 'refus', 5),
('n''avons pas retenu', 'refus', 5),
('votre offre n''a pas été', 'refus', 5),
('infructueux', 'refus', 4),
('sans suite', 'refus', 4),
('ne donnera pas suite', 'refus', 5),
('offre moins disante', 'refus', 4),
('retenu', 'acceptation', 5),
('votre offre a été retenue', 'acceptation', 5),
('nous avons le plaisir', 'acceptation', 4),
('ordre de service', 'acceptation', 5),
('notification de marché', 'acceptation', 5),
('attributaire', 'acceptation', 5),
('bon de commande', 'acceptation', 4)
ON CONFLICT (keyword) DO NOTHING;
