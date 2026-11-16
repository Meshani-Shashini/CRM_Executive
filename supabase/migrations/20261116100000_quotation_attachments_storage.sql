INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('quotation-attachments', 'quotation-attachments', FALSE, 8388608)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff can read tenant quotation attachments" ON storage.objects;
CREATE POLICY "Staff can read tenant quotation attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'quotation-attachments'
    AND (storage.foldername(name))[1] = public.current_profile_tenant_id()::TEXT
    AND public.current_profile_role() IN ('System Admin', 'Sales', 'Accountant')
  );

DROP POLICY IF EXISTS "Sales staff can upload tenant quotation attachments" ON storage.objects;
CREATE POLICY "Sales staff can upload tenant quotation attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quotation-attachments'
    AND (storage.foldername(name))[1] = public.current_profile_tenant_id()::TEXT
    AND public.current_profile_role() IN ('System Admin', 'Sales')
  );
