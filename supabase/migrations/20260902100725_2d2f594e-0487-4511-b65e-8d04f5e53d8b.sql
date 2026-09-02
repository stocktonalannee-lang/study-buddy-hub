CREATE POLICY "notes_upload_own_folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "notes_read_own_folder" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "notes_delete_own_folder" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'notes' AND (storage.foldername(name))[1] = auth.uid()::text);