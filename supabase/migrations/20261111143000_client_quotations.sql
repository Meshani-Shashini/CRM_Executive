BEGIN;

ALTER TABLE public.tenant_sequences DROP CONSTRAINT IF EXISTS tenant_sequences_kind_check;
ALTER TABLE public.tenant_sequences
  ADD CONSTRAINT tenant_sequences_kind_check
  CHECK (kind IN ('deal', 'quotation-request', 'invoice', 'client-quotation'));

CREATE OR REPLACE FUNCTION public.allocate_tenant_reference(
  p_tenant_id UUID,
  p_kind TEXT,
  p_year INT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prefix TEXT;
  highest_existing INT := 0;
  next_value INT;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('deal', 'quotation-request', 'invoice', 'client-quotation')
    OR p_year IS NULL OR p_year < 2000 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Choose a valid reference type and year.'
      USING ERRCODE = '22023';
  END IF;

  prefix := CASE p_kind
    WHEN 'deal' THEN 'DL'
    WHEN 'quotation-request' THEN 'QRS'
    WHEN 'invoice' THEN 'INV'
    WHEN 'client-quotation' THEN 'QTY'
  END;

  IF p_kind = 'deal' THEN
    SELECT COALESCE(max((matches.parts)[1]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'reference', '^DL-' || p_year::TEXT || '-([0-9]+)$') AS matches(parts)
    WHERE record.tenant_id = p_tenant_id AND record.resource = 'deals';
  ELSIF p_kind = 'quotation-request' THEN
    SELECT COALESCE(max((matches.parts)[2]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'reference', '^(QR|QRS)-' || p_year::TEXT || '-([0-9]+)$') AS matches(parts)
    WHERE record.tenant_id = p_tenant_id AND record.resource = 'quotation-requests';
  ELSIF p_kind = 'client-quotation' THEN
    SELECT COALESCE(max((matches.parts)[1]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'reference', '^QTY-' || p_year::TEXT || '-([0-9]+)(?:-R[0-9]+)?$') AS matches(parts)
    WHERE record.tenant_id = p_tenant_id AND record.resource = 'client-quotations';
  ELSE
    SELECT COALESCE(max((matches.parts)[1]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'invoiceNumber', '^INV-' || p_year::TEXT || '-([0-9]+)$') AS matches(parts)
    WHERE record.tenant_id = p_tenant_id AND record.resource = 'invoices';
  END IF;

  INSERT INTO public.tenant_sequences (tenant_id, kind, year, current_val)
  VALUES (p_tenant_id, p_kind, p_year, highest_existing + 1)
  ON CONFLICT (tenant_id, kind, year)
  DO UPDATE SET current_val = GREATEST(
    public.tenant_sequences.current_val,
    EXCLUDED.current_val - 1
  ) + 1
  RETURNING current_val INTO next_value;

  RETURN prefix || '-' || p_year::TEXT || '-' || lpad(next_value::TEXT, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_tenant_reference(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_read_tenant_record(
  p_resource TEXT,
  p_data JSONB,
  p_tenant_id UUID
)
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
  IF profile.role <> 'Client' OR profile.client_record_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_resource = 'clients' THEN
    RETURN p_data ->> 'id' = profile.client_record_id;
  ELSIF p_resource IN ('deals', 'invoices', 'payments', 'client-quotations') THEN
    IF p_data ->> 'clientId' = profile.client_record_id THEN
      RETURN TRUE;
    END IF;

    IF p_resource = 'payments' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.tenant_records AS invoice
        WHERE invoice.tenant_id = p_tenant_id
          AND invoice.resource = 'invoices'
          AND invoice.record_id = p_data ->> 'invoiceId'
          AND invoice.data ->> 'clientId' = profile.client_record_id
      );
    END IF;
    RETURN FALSE;
  ELSIF p_resource = 'activities' THEN
    RETURN p_data ->> 'clientId' = profile.client_record_id;
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_tenant_records(
  p_resource TEXT,
  p_records JSONB,
  p_delete_missing BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  item JSONB;
  existing_record public.tenant_records%ROWTYPE;
  entered_at TIMESTAMPTZ;
  exited_at TIMESTAMPTZ;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'customer-lookups', 'activities', 'audit-log', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'lead-stage-history', 'company', 'email-templates', 'products', 'policy-types',
    'vendors', 'quotation-requests', 'client-quotations'
  ];
  allowed BOOLEAN;
BEGIN
  SELECT * INTO profile FROM public.user_profiles
  WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
  END IF;
  IF p_resource IS NULL OR p_resource <> ALL(allowed_resources)
    OR jsonb_typeof(p_records) IS DISTINCT FROM 'array'
    OR p_delete_missing IS NULL THEN
    RAISE EXCEPTION 'Invalid record collection' USING ERRCODE = '22023';
  END IF;

  allowed := CASE profile.role
    WHEN 'System Admin' THEN TRUE
    WHEN 'Sales' THEN p_resource = ANY(ARRAY[
      'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'vendors',
      'quotation-requests', 'client-quotations', 'stage-history', 'lead-stage-history'
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
    FOR item IN SELECT records.record_data FROM jsonb_array_elements(p_records) AS records(record_data)
    LOOP
      entered_at := (item ->> 'entered_at')::TIMESTAMPTZ;
      IF item ? 'exited_at' THEN
        exited_at := (item ->> 'exited_at')::TIMESTAMPTZ;
        IF exited_at < entered_at THEN
          RAISE EXCEPTION 'Lead stage exit cannot precede its entry' USING ERRCODE = '22023';
        END IF;
        IF abs((item ->> 'duration_days')::NUMERIC
          - EXTRACT(EPOCH FROM (exited_at - entered_at)) / 86400) > 0.0000115740740741 THEN
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

  FOR item IN SELECT records.record_data FROM jsonb_array_elements(p_records) AS records(record_data)
  LOOP
    SELECT * INTO existing_record
    FROM public.tenant_records
    WHERE tenant_id = profile.tenant_id AND resource = p_resource AND record_id = item ->> 'id'
    FOR UPDATE;
    IF FOUND AND existing_record.data IS DISTINCT FROM (item - '__expectedUpdatedAt') THEN
      IF NULLIF(item ->> '__expectedUpdatedAt', '') IS NULL
        OR (item ->> '__expectedUpdatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        OR (item ->> '__expectedUpdatedAt')::TIMESTAMPTZ IS DISTINCT FROM existing_record.updated_at THEN
        RAISE EXCEPTION 'Record modified by another user. Please reload.'
          USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.tenant_records AS current_record (tenant_id, resource, record_id, data, updated_at)
  SELECT profile.tenant_id, p_resource, records.record_data ->> 'id',
    records.record_data - '__expectedUpdatedAt', clock_timestamp()
  FROM jsonb_array_elements(p_records) AS records(record_data)
  ON CONFLICT (tenant_id, resource, record_id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = clock_timestamp()
  WHERE current_record.data IS DISTINCT FROM EXCLUDED.data;

  IF p_delete_missing AND p_resource NOT IN ('activities', 'audit-log') THEN
    DELETE FROM public.tenant_records AS existing
    WHERE existing.tenant_id = profile.tenant_id AND existing.resource = p_resource
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_records) AS records(record_data)
        WHERE records.record_data ->> 'id' = existing.record_id
      );
  END IF;

  RETURN COALESCE((
    SELECT jsonb_object_agg(record.record_id, jsonb_build_object('updated_at', record.updated_at, 'data', record.data))
    FROM public.tenant_records AS record
    WHERE record.tenant_id = profile.tenant_id AND record.resource = p_resource
      AND record.record_id IN (
        SELECT records.record_data ->> 'id' FROM jsonb_array_elements(p_records) AS records(record_data)
      )
  ), '{}'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_records_client_quotations_reference_version_uidx
  ON public.tenant_records (tenant_id, (data ->> 'reference'), ((data ->> 'version')::INT))
  WHERE resource = 'client-quotations'
    AND NULLIF(data ->> 'reference', '') IS NOT NULL
    AND NULLIF(data ->> 'version', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_client_quotation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_request public.tenant_records%ROWTYPE;
  source_line JSONB;
BEGIN
  IF NEW.resource <> 'client-quotations' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.data ->> 'reference', '') !~ '^QTY-[0-9]{4}-[0-9]{4,}$'
    OR COALESCE((NEW.data ->> 'version')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Client quotation reference or version is invalid.' USING ERRCODE = '23514';
  END IF;
  IF NEW.data ->> 'status' NOT IN ('Draft', 'Issued', 'Accepted', 'Rejected', 'Expired', 'Superseded') THEN
    RAISE EXCEPTION 'Client quotation status is invalid.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.data ->> 'reference' IS DISTINCT FROM OLD.data ->> 'reference'
    OR NEW.data ->> 'version' IS DISTINCT FROM OLD.data ->> 'version'
    OR NEW.data ->> 'sourceRequestId' IS DISTINCT FROM OLD.data ->> 'sourceRequestId'
    OR NEW.data ->> 'sourceLineId' IS DISTINCT FROM OLD.data ->> 'sourceLineId'
  ) THEN
    RAISE EXCEPTION 'Client quotation reference, version, and source line are immutable.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO source_request
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'quotation-requests'
    AND record_id = NEW.data ->> 'sourceRequestId';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client quotation source request was not found.' USING ERRCODE = '23503';
  END IF;
  SELECT value INTO source_line
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(source_request.data -> 'lines') = 'array'
      THEN source_request.data -> 'lines' ELSE '[]'::JSONB END
  ) AS source(value)
  WHERE value ->> 'id' = NEW.data ->> 'sourceLineId';
  IF source_line IS NULL OR (
    TG_OP = 'INSERT' AND source_line ->> 'status' IS DISTINCT FROM 'Quoted'
  ) THEN
    RAISE EXCEPTION 'Client quotation must originate from a Quoted QRS line.' USING ERRCODE = '23514';
  END IF;
  IF NEW.data ->> 'dealId' IS DISTINCT FROM source_request.data ->> 'dealId'
    OR NEW.data ->> 'leadId' IS DISTINCT FROM source_request.data ->> 'leadId'
    OR NEW.data ->> 'clientId' IS DISTINCT FROM source_request.data ->> 'clientId' THEN
    RAISE EXCEPTION 'Client quotation deal, lead, and client must match its source request.' USING ERRCODE = '23514';
  END IF;
  IF NEW.data ->> 'status' IN ('Issued', 'Accepted')
    AND (
      COALESCE((NEW.data ->> 'proposedPremium')::NUMERIC, 0) <= 0
      OR COALESCE((NEW.data ->> 'totalSumInsured')::NUMERIC, 0) <= 0
      OR NULLIF(btrim(NEW.data #>> '{addressee,name}'), '') IS NULL
      OR (NEW.data ->> 'validUntil')::DATE < CURRENT_DATE
      OR NULLIF(btrim(NEW.data ->> 'preparedBy'), '') IS NULL
      OR NULLIF(btrim(NEW.data ->> 'authorizedBy'), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Issued quotations require positive pricing, a valid term, and complete addressee/preparer details.' USING ERRCODE = '23514';
  END IF;
  IF NEW.data ->> 'status' IN ('Issued', 'Accepted')
    AND COALESCE((
      SELECT (company.data ->> 'requireDifferentQuotationAuthorizer')::BOOLEAN
      FROM public.tenant_records AS company
      WHERE company.tenant_id = NEW.tenant_id AND company.resource = 'company'
      LIMIT 1
    ), TRUE)
    AND NEW.data ->> 'preparedBy' = NEW.data ->> 'authorizedBy' THEN
    RAISE EXCEPTION 'The quotation authorizer must be different from the preparer.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_client_quotation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_validate_client_quotation ON public.tenant_records;
CREATE TRIGGER tenant_records_validate_client_quotation
  BEFORE INSERT OR UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_client_quotation();

CREATE OR REPLACE FUNCTION public.advance_deal_after_client_quotation_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_deal public.tenant_records%ROWTYPE;
  current_stage public.tenant_records%ROWTYPE;
  next_stage public.tenant_records%ROWTYPE;
  current_stage_id TEXT;
  next_stage_id TEXT;
  entered_at TIMESTAMPTZ := clock_timestamp();
  activity_id TEXT := 'client-quotation-accepted-' || gen_random_uuid()::TEXT;
  stage_history_id TEXT := 'client-quotation-stage-' || gen_random_uuid()::TEXT;
BEGIN
  IF NEW.resource <> 'client-quotations'
    OR OLD.data ->> 'status' IS DISTINCT FROM 'Issued'
    OR NEW.data ->> 'status' NOT IN ('Accepted', 'Rejected')
    OR current_setting('app.client_quotation_response', TRUE) IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
  VALUES (NEW.tenant_id, 'activities', activity_id, jsonb_build_object(
    'id', activity_id,
    'clientId', NEW.data ->> 'clientId',
    'leadId', NEW.data ->> 'leadId',
    'dealId', NEW.data ->> 'dealId',
    'type', 'note',
    'title', 'Client quotation ' || lower(NEW.data ->> 'status'),
    'description', (NEW.data ->> 'reference') || ' v' || (NEW.data ->> 'version')
      || ' ' || lower(NEW.data ->> 'status') || ' by '
      || COALESCE(NEW.data #>> '{clientResponse,name}', NEW.data #>> '{acceptance,name}') || '.',
    'date', entered_at,
    'createdAt', entered_at,
    'userId', COALESCE(NEW.data #>> '{clientResponse,respondedBy}', NEW.data #>> '{acceptance,acceptedBy}', NEW.data ->> 'preparedBy'),
    'actorName', COALESCE(NEW.data #>> '{clientResponse,name}', NEW.data #>> '{acceptance,name}')
  ), entered_at);
  IF NEW.data ->> 'status' <> 'Accepted' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO current_deal FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id AND resource = 'deals' AND record_id = NEW.data ->> 'dealId';
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO current_stage FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipeline-stages'
    AND data ->> 'pipelineId' = current_deal.data ->> 'pipelineId'
    AND data ->> 'name' = current_deal.data ->> 'stage';
  IF NOT FOUND THEN RETURN NEW; END IF;
  current_stage_id := current_stage.data ->> 'id';

  SELECT * INTO next_stage FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipeline-stages'
    AND data ->> 'pipelineId' = current_deal.data ->> 'pipelineId'
    AND (data ->> 'stageOrder')::INT > (current_stage.data ->> 'stageOrder')::INT
  ORDER BY (data ->> 'stageOrder')::INT
  LIMIT 1;
  IF NOT FOUND OR COALESCE((next_stage.data ->> 'isClosedWon')::BOOLEAN, FALSE)
    OR COALESCE((next_stage.data ->> 'isClosedLost')::BOOLEAN, FALSE) THEN
    RETURN NEW;
  END IF;
  next_stage_id := next_stage.data ->> 'id';

  UPDATE public.tenant_records
  SET data = data || jsonb_build_object(
    'stage', next_stage.data ->> 'name',
    'stageChangedAt', entered_at,
    'probability', COALESCE((next_stage.data ->> 'winProbabilityPct')::NUMERIC, 0),
    'weighted', round(COALESCE((current_deal.data ->> 'value')::NUMERIC, 0)
      * COALESCE((next_stage.data ->> 'winProbabilityPct')::NUMERIC, 0) / 100, 2)
  ), updated_at = entered_at
  WHERE tenant_id = NEW.tenant_id AND resource = 'deals' AND record_id = current_deal.record_id;

  UPDATE public.tenant_records
  SET data = data || jsonb_build_object(
    'exitedAt', entered_at,
    'durationSeconds', GREATEST(0, floor(EXTRACT(EPOCH FROM (entered_at - (data ->> 'enteredAt')::TIMESTAMPTZ)))::INT)
  ), updated_at = entered_at
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'stage-history'
    AND data ->> 'dealId' = current_deal.record_id
    AND data -> 'exitedAt' = 'null'::JSONB;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
  VALUES (NEW.tenant_id, 'stage-history', stage_history_id, jsonb_build_object(
    'id', stage_history_id,
    'tenantId', NEW.tenant_id,
    'dealId', current_deal.record_id,
    'userId', COALESCE(NEW.data #>> '{acceptance,acceptedBy}', NEW.data ->> 'preparedBy'),
    'fromStageId', current_stage_id,
    'toStageId', next_stage_id,
    'enteredAt', entered_at,
    'exitedAt', NULL,
    'durationSeconds', NULL,
    'details', 'Advanced after client accepted ' || (NEW.data ->> 'reference') || '.'
  ), entered_at);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_deal_after_client_quotation_acceptance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_advance_after_quotation_acceptance ON public.tenant_records;
CREATE TRIGGER tenant_records_advance_after_quotation_acceptance
  AFTER UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.advance_deal_after_client_quotation_acceptance();

CREATE OR REPLACE FUNCTION public.accept_client_quotation(
  p_tenant_id UUID,
  p_quotation_id TEXT,
  p_status TEXT,
  p_name TEXT,
  p_designation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  quotation public.tenant_records%ROWTYPE;
  acceptance JSONB;
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = (SELECT auth.uid()) AND tenant_id = p_tenant_id;
  IF NOT FOUND OR profile.role <> 'Client' OR profile.client_record_id IS NULL THEN
    RAISE EXCEPTION 'Only the linked client may respond to this quotation.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Accepted', 'Rejected') OR NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Provide a valid client response.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO quotation FROM public.tenant_records
  WHERE tenant_id = p_tenant_id AND resource = 'client-quotations' AND record_id = p_quotation_id
  FOR UPDATE;
  IF NOT FOUND OR quotation.data ->> 'clientId' IS DISTINCT FROM profile.client_record_id
    OR quotation.data ->> 'status' IS DISTINCT FROM 'Issued' THEN
    RAISE EXCEPTION 'This quotation is unavailable for client response.' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'Accepted' AND (quotation.data ->> 'validUntil')::DATE < CURRENT_DATE THEN
    RAISE EXCEPTION 'This quotation has expired.' USING ERRCODE = '23514';
  END IF;

  acceptance := jsonb_build_object(
    'name', btrim(p_name),
    'designation', btrim(COALESCE(p_designation, '')),
    'signedAt', clock_timestamp(),
    'acceptedBy', profile.id
  );
  PERFORM set_config('app.client_quotation_response', 'true', TRUE);
  UPDATE public.tenant_records
  SET data = data || jsonb_build_object('status', p_status)
    || jsonb_build_object('clientResponse', jsonb_build_object(
      'name', btrim(p_name),
      'designation', btrim(COALESCE(p_designation, '')),
      'respondedAt', clock_timestamp(),
      'respondedBy', profile.id
    ))
    || CASE WHEN p_status = 'Accepted' THEN jsonb_build_object('acceptance', acceptance) ELSE '{}'::JSONB END,
    updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND resource = 'client-quotations' AND record_id = p_quotation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_client_quotation(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_client_quotation(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
