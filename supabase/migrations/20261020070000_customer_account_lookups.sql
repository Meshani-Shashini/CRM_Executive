CREATE OR REPLACE FUNCTION public.sync_tenant_records(p_resource TEXT, p_records JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'company', 'email-templates', 'products', 'policy-types'
  ];
  allowed BOOLEAN;
BEGIN
  SELECT * INTO profile FROM public.user_profiles
  WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
  END IF;
  IF p_resource IS NULL OR p_resource <> ALL(allowed_resources)
    OR jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid record collection' USING ERRCODE = '22023';
  END IF;

  allowed := CASE profile.role
    WHEN 'System Admin' THEN TRUE
    WHEN 'Sales' THEN p_resource = ANY(ARRAY[
      'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'stage-history'
    ])
    WHEN 'Accountant' THEN p_resource = ANY(ARRAY['invoices', 'payments'])
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Role is not allowed to update this collection' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(item)
    WHERE jsonb_typeof(item) <> 'object'
      OR jsonb_typeof(item -> 'id') <> 'string'
      OR COALESCE(length(item ->> 'id'), 0) = 0
  ) THEN
    RAISE EXCEPTION 'Every record must have a non-empty string id' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
  SELECT profile.tenant_id, p_resource, item ->> 'id', item, NOW()
  FROM jsonb_array_elements(p_records) AS records(item)
  ON CONFLICT (tenant_id, resource, record_id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

  DELETE FROM public.tenant_records AS existing
  WHERE existing.tenant_id = profile.tenant_id
    AND existing.resource = p_resource
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_records) AS records(item)
      WHERE item ->> 'id' = existing.record_id
    );
END;
$$;
