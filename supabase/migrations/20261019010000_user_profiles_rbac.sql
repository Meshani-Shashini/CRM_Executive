CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Client'
    CHECK (role IN ('System Admin', 'Sales', 'Accountant', 'Client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_profiles_tenant_role_idx
  ON public.user_profiles (tenant_id, role);

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, tenant_id, name, email, role, title)
  VALUES (
    NEW.id,
    '00000000-0000-4000-8000-000000000001',
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    'Client',
    'Client'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

CREATE OR REPLACE FUNCTION public.touch_user_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_touch_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_touch_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_profile_updated_at();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.user_profiles WHERE id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_profile_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.user_profiles WHERE id = (SELECT auth.uid())
$$;

DROP POLICY IF EXISTS "Users can read their own profile" ON public.user_profiles;
CREATE POLICY "Users can read their own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "System admins can read tenant profiles" ON public.user_profiles;
CREATE POLICY "System admins can read tenant profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    public.current_profile_role() = 'System Admin'
    AND tenant_id = public.current_profile_tenant_id()
  );

DROP POLICY IF EXISTS "System admins can update tenant profiles" ON public.user_profiles;
CREATE POLICY "System admins can update tenant profiles"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (
    public.current_profile_role() = 'System Admin'
    AND tenant_id = public.current_profile_tenant_id()
  )
  WITH CHECK (
    public.current_profile_role() = 'System Admin'
    AND tenant_id = public.current_profile_tenant_id()
  );

GRANT SELECT ON public.user_profiles TO authenticated;
GRANT UPDATE (role, title, name) ON public.user_profiles TO authenticated;
REVOKE INSERT, DELETE ON public.user_profiles FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tenant_records (
  tenant_id UUID NOT NULL,
  resource TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, resource, record_id),
  CHECK (jsonb_typeof(data) IN ('object', 'array'))
);

CREATE INDEX IF NOT EXISTS tenant_records_resource_idx
  ON public.tenant_records (tenant_id, resource);

ALTER TABLE public.tenant_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_tenant_record(p_resource TEXT, p_data JSONB, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = (SELECT auth.uid()) AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF profile.role IN ('System Admin', 'Sales', 'Accountant') THEN
    RETURN TRUE;
  END IF;

  IF profile.role <> 'Client' THEN
    RETURN FALSE;
  END IF;

  IF p_resource = 'clients' THEN
    RETURN lower(COALESCE(p_data ->> 'email', '')) = lower(profile.email);
  END IF;

  IF p_resource = 'invoices' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_records AS client_record
      WHERE client_record.tenant_id = p_tenant_id
        AND client_record.resource = 'clients'
        AND lower(COALESCE(client_record.data ->> 'email', '')) = lower(profile.email)
        AND client_record.data ->> 'id' = p_data ->> 'clientId'
    );
  END IF;

  IF p_resource = 'payments' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_records AS invoice_record
      WHERE invoice_record.tenant_id = p_tenant_id
        AND invoice_record.resource = 'invoices'
        AND invoice_record.data ->> 'id' = p_data ->> 'invoiceId'
        AND EXISTS (
          SELECT 1 FROM public.tenant_records AS client_record
          WHERE client_record.tenant_id = p_tenant_id
            AND client_record.resource = 'clients'
            AND lower(COALESCE(client_record.data ->> 'email', '')) = lower(profile.email)
            AND client_record.data ->> 'id' = invoice_record.data ->> 'clientId'
        )
    );
  END IF;

  IF p_resource = 'activities' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_records AS client_record
      WHERE client_record.tenant_id = p_tenant_id
        AND client_record.resource = 'clients'
        AND lower(COALESCE(client_record.data ->> 'email', '')) = lower(profile.email)
        AND client_record.data ->> 'id' = p_data ->> 'clientId'
    );
  END IF;

  RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS "Tenant members can read permitted records" ON public.tenant_records;
CREATE POLICY "Tenant members can read permitted records"
  ON public.tenant_records FOR SELECT TO authenticated
  USING (public.can_read_tenant_record(resource, data, tenant_id));

CREATE OR REPLACE FUNCTION public.sync_tenant_records(p_resource TEXT, p_records JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'activities', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'company', 'email-templates'
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
    WHEN 'Sales' THEN p_resource = ANY(ARRAY['leads', 'clients', 'activities', 'deals', 'stage-history'])
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

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_profile_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_tenant_records(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenant_records(TEXT, JSONB) TO authenticated;

REVOKE ALL ON public.tenant_records FROM anon, authenticated;
GRANT SELECT ON public.tenant_records TO authenticated;

-- After registering the intended initial administrator, promote that account:
-- UPDATE public.user_profiles SET role = 'System Admin'
-- WHERE lower(email) = lower('admin@example.com');