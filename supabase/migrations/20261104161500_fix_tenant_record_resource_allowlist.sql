CREATE OR REPLACE FUNCTION public.sync_tenant_records(p_resource TEXT, p_records JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  item JSONB;
  entered_at TIMESTAMPTZ;
  exited_at TIMESTAMPTZ;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'lead-stage-history', 'company', 'email-templates', 'products', 'policy-types'
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
      'leads', 'clients', 'customer-lookups', 'activities', 'deals',
      'stage-history', 'lead-stage-history'
    ])
    WHEN 'Accountant' THEN p_resource = ANY(ARRAY['invoices', 'payments'])
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Role is not allowed to update this collection' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(record_data)
    WHERE jsonb_typeof(records.record_data) <> 'object'
      OR jsonb_typeof(records.record_data -> 'id') <> 'string'
      OR COALESCE(length(records.record_data ->> 'id'), 0) = 0
  ) THEN
    RAISE EXCEPTION 'Every record must have a non-empty string id' USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'lead-stage-history' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(stage_record)
    WHERE jsonb_typeof(records.stage_record -> 'lead_id') IS DISTINCT FROM 'string'
      OR COALESCE(length(records.stage_record ->> 'lead_id'), 0) = 0
      OR jsonb_typeof(records.stage_record -> 'stage') IS DISTINCT FROM 'string'
      OR (records.stage_record ->> 'stage') <> ALL(ARRAY[
        'Lead Identified', 'Contact Made', 'Key Person Identified',
        'Intro Email Sent', 'Meetings Ongoing', 'Converted to deal', 'Lost'
      ])
      OR jsonb_typeof(records.stage_record -> 'entered_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(records.stage_record -> 'is_current') IS DISTINCT FROM 'boolean'
      OR (records.stage_record ? 'duration_days' AND jsonb_typeof(records.stage_record -> 'duration_days') IS DISTINCT FROM 'number')
      OR (records.stage_record ? 'exited_at' AND jsonb_typeof(records.stage_record -> 'exited_at') IS DISTINCT FROM 'string')
      OR (records.stage_record ? 'duration_days' AND NOT (records.stage_record ? 'exited_at'))
      OR (records.stage_record ? 'exited_at' AND NOT (records.stage_record ? 'duration_days'))
  ) THEN
    RAISE EXCEPTION 'Invalid lead stage history record' USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'lead-stage-history' THEN
    FOR item IN
      SELECT records.record_data
      FROM jsonb_array_elements(p_records) AS records(record_data)
    LOOP
      entered_at := (item ->> 'entered_at')::TIMESTAMPTZ;
      IF item ? 'exited_at' THEN
        exited_at := (item ->> 'exited_at')::TIMESTAMPTZ;
        IF exited_at < entered_at THEN
          RAISE EXCEPTION 'Lead stage exit cannot precede its entry' USING ERRCODE = '22023';
        END IF;
        IF abs(
          (item ->> 'duration_days')::NUMERIC
          - EXTRACT(EPOCH FROM (exited_at - entered_at)) / 86400
        ) > 0.000000001 THEN
          RAISE EXCEPTION 'Lead stage duration does not match its timestamps' USING ERRCODE = '22023';
        END IF;
      END IF;
      IF item ? 'duration_days' AND (item ->> 'duration_days')::NUMERIC < 0 THEN
        RAISE EXCEPTION 'Lead stage duration cannot be negative' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT records.stage_record ->> 'lead_id'
      FROM jsonb_array_elements(p_records) AS records(stage_record)
      GROUP BY records.stage_record ->> 'lead_id'
      HAVING count(*) FILTER (WHERE (records.stage_record ->> 'is_current')::BOOLEAN) <> 1
    ) THEN
      RAISE EXCEPTION 'Each lead must have exactly one current stage record' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
  SELECT profile.tenant_id, p_resource, records.record_data ->> 'id', records.record_data, NOW()
  FROM jsonb_array_elements(p_records) AS records(record_data)
  ON CONFLICT (tenant_id, resource, record_id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

  DELETE FROM public.tenant_records AS existing
  WHERE existing.tenant_id = profile.tenant_id
    AND existing.resource = p_resource
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_records) AS records(record_data)
      WHERE records.record_data ->> 'id' = existing.record_id
    );
END;
$$;
