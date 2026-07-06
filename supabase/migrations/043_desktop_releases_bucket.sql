-- Bucket public pour les installateurs Operis (fichiers .exe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desktop-releases',
  'desktop-releases',
  false,
  524288000,
  ARRAY['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable']
)
ON CONFLICT (id) DO NOTHING;
