-- Bucket Supabase Storage pour pièces jointes mail (Pro)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('mail-attachments', 'mail-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 26214400;
