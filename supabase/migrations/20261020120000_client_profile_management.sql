ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS client_record_id TEXT;

WITH unique_client_matches AS (
  SELECT profile.id AS profile_id, min(client_record.record_id) AS client_record_id
  FROM public.user_profiles AS profile
  JOIN public.tenant_records AS client_record
    ON client_record.tenant_id = profile.tenant_id
    AND client_record.resource = 'clients'
    AND lower(COALESCE(client_record.data ->> 'email', '')) = lower(profile.email)
  WHERE profile.role = 'Client'
    AND profile.client_record_id IS NULL
  GROUP BY profile.id
  HAVING count(*) = 1
)
UPDATE public.user_profiles AS profile
SET client_record_id = matches.client_record_id
FROM unique_client_matches AS matches
WHERE profile.id = matches.profile_id;

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
    RETURN profile.client_record_id IS NOT NULL
      AND p_data ->> 'id' = profile.client_record_id;
  END IF;

  IF p_resource = 'invoices' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_records AS client_record
      WHERE client_record.tenant_id = p_tenant_id
        AND client_record.resource = 'clients'
        AND profile.client_record_id IS NOT NULL
        AND client_record.data ->> 'id' = profile.client_record_id
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
            AND profile.client_record_id IS NOT NULL
            AND client_record.data ->> 'id' = profile.client_record_id
            AND client_record.data ->> 'id' = invoice_record.data ->> 'clientId'
        )
    );
  END IF;

  IF p_resource = 'activities' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_records AS client_record
      WHERE client_record.tenant_id = p_tenant_id
        AND client_record.resource = 'clients'
        AND profile.client_record_id IS NOT NULL
        AND client_record.data ->> 'id' = profile.client_record_id
        AND client_record.data ->> 'id' = p_data ->> 'clientId'
    );
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_own_client_contact(
  p_client_id TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_address TEXT,
  p_contact_person TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  client_record public.tenant_records%ROWTYPE;
  new_email TEXT := lower(btrim(COALESCE(p_email, '')));
  new_phone TEXT := btrim(COALESCE(p_phone, ''));
  new_address TEXT := btrim(COALESCE(p_address, ''));
  new_contact_person TEXT := btrim(COALESCE(p_contact_person, ''));
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = (SELECT auth.uid())
  FOR UPDATE;

  IF NOT FOUND OR profile.role <> 'Client' THEN
    RAISE EXCEPTION 'Client profile access required' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NULL OR btrim(p_client_id) = ''
    OR new_email = ''
    OR new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid client ID and contact email are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO client_record
  FROM public.tenant_records
  WHERE tenant_id = profile.tenant_id
    AND resource = 'clients'
    AND record_id = p_client_id
    AND profile.client_record_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client record is not associated with the signed-in account' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_records
  SET data = jsonb_set(
    client_record.data || jsonb_build_object(
      'phone', new_phone,
      'email', new_email,
      'address', new_address,
      'contactPerson', new_contact_person
    ),
    '{insuredEntity}',
    COALESCE(client_record.data -> 'insuredEntity', '{}'::jsonb)
      || jsonb_build_object(
        'primaryStakeholder',
        COALESCE(client_record.data #> '{insuredEntity,primaryStakeholder}', '{}'::jsonb)
          || jsonb_build_object(
            'fullName', new_contact_person,
            'email', new_email,
            'whatsappMobile', new_phone
          )
      ),
    TRUE
  ),
  updated_at = NOW()
  WHERE tenant_id = client_record.tenant_id
    AND resource = client_record.resource
    AND record_id = client_record.record_id;

  UPDATE public.user_profiles
  SET client_record_id = p_client_id
  WHERE id = profile.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_client_contact(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_client_contact(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
