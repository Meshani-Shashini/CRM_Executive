BEGIN;

CREATE OR REPLACE FUNCTION public.validate_client_quotation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_request public.tenant_records%ROWTYPE;
  source_item JSONB;
  source_line JSONB;
  source_section JSONB;
  source_quote JSONB;
  check_sources BOOLEAN;
BEGIN
  IF NEW.resource <> 'client-quotations' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.data ->> 'reference', '') !~ '^QTY-[0-9]{4}-[0-9]{4}$'
    OR COALESCE((NEW.data ->> 'version')::INT, 0) < 1 THEN
    RAISE EXCEPTION 'Client quotation reference or version is invalid.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.data ->> 'status', '') NOT IN ('Draft', 'Issued', 'Accepted', 'Rejected', 'Expired', 'Superseded') THEN
    RAISE EXCEPTION 'Client quotation status is invalid.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.data ->> 'reference' IS DISTINCT FROM OLD.data ->> 'reference'
    OR NEW.data ->> 'version' IS DISTINCT FROM OLD.data ->> 'version'
    OR NEW.data ->> 'requestId' IS DISTINCT FROM OLD.data ->> 'requestId'
    OR NEW.data -> 'sources' IS DISTINCT FROM OLD.data -> 'sources'
    OR NEW.data ->> 'dealId' IS DISTINCT FROM OLD.data ->> 'dealId'
    OR NEW.data ->> 'leadId' IS DISTINCT FROM OLD.data ->> 'leadId'
    OR NEW.data ->> 'clientId' IS DISTINCT FROM OLD.data ->> 'clientId'
  ) THEN
    RAISE EXCEPTION 'Client quotation reference, version, request, source lines, and linked identities are immutable.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.data ->> 'status' <> 'Draft' AND (
    NEW.data -> 'sections' IS DISTINCT FROM OLD.data -> 'sections'
    OR NEW.data ->> 'insuredName' IS DISTINCT FROM OLD.data ->> 'insuredName'
    OR NEW.data ->> 'territorialLimits' IS DISTINCT FROM OLD.data ->> 'territorialLimits'
    OR NEW.data ->> 'occupation' IS DISTINCT FROM OLD.data ->> 'occupation'
    OR NEW.data ->> 'riskLocation' IS DISTINCT FROM OLD.data ->> 'riskLocation'
    OR NEW.data ->> 'currency' IS DISTINCT FROM OLD.data ->> 'currency'
    OR NEW.data ->> 'totalPremium' IS DISTINCT FROM OLD.data ->> 'totalPremium'
    OR NEW.data ->> 'totalSumInsured' IS DISTINCT FROM OLD.data ->> 'totalSumInsured'
    OR NEW.data ->> 'disclaimer' IS DISTINCT FROM OLD.data ->> 'disclaimer'
    OR NEW.data ->> 'validityDays' IS DISTINCT FROM OLD.data ->> 'validityDays'
    OR NEW.data ->> 'issuedAt' IS DISTINCT FROM OLD.data ->> 'issuedAt'
    OR NEW.data ->> 'validUntil' IS DISTINCT FROM OLD.data ->> 'validUntil'
    OR NEW.data -> 'addressee' IS DISTINCT FROM OLD.data -> 'addressee'
    OR NEW.data ->> 'policyNo' IS DISTINCT FROM OLD.data ->> 'policyNo'
    OR NEW.data ->> 'endorsementNo' IS DISTINCT FROM OLD.data ->> 'endorsementNo'
    OR NEW.data ->> 'policyPeriod' IS DISTINCT FROM OLD.data ->> 'policyPeriod'
    OR NEW.data ->> 'preparedBy' IS DISTINCT FROM OLD.data ->> 'preparedBy'
    OR NEW.data ->> 'authorizedBy' IS DISTINCT FROM OLD.data ->> 'authorizedBy'
  ) THEN
    RAISE EXCEPTION 'Issued quotation content is a fixed snapshot; create a revision to change it.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.data -> 'sections') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.data -> 'sources') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Client quotations require section and source arrays.' USING ERRCODE = '23514';
  END IF;
  IF jsonb_array_length(NEW.data -> 'sections') = 0
    OR jsonb_array_length(NEW.data -> 'sources') = 0 THEN
    RAISE EXCEPTION 'Client quotations require at least one section and source line.' USING ERRCODE = '23514';
  END IF;

  check_sources := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' AND (
    NEW.data ->> 'status' = 'Draft'
    OR (OLD.data ->> 'status' = 'Draft' AND NEW.data ->> 'status' = 'Issued')
  ) THEN
    check_sources := TRUE;
  END IF;

  IF check_sources THEN
    SELECT * INTO source_request
    FROM public.tenant_records
    WHERE tenant_id = NEW.tenant_id
      AND resource = 'quotation-requests'
      AND record_id = NEW.data ->> 'requestId';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Client quotation source request was not found.' USING ERRCODE = '23503';
    END IF;
    IF NEW.data ->> 'dealId' IS DISTINCT FROM source_request.data ->> 'dealId'
      OR NEW.data ->> 'leadId' IS DISTINCT FROM source_request.data ->> 'leadId'
      OR NEW.data ->> 'clientId' IS DISTINCT FROM source_request.data ->> 'clientId' THEN
      RAISE EXCEPTION 'Client quotation deal, lead, and client must match its source request.' USING ERRCODE = '23514';
    END IF;

    FOR source_item IN
      SELECT value FROM jsonb_array_elements(NEW.data -> 'sources') AS source(value)
    LOOP
    SELECT value INTO source_line
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(source_request.data -> 'lines') = 'array'
        THEN source_request.data -> 'lines' ELSE '[]'::JSONB END
    ) AS line(value)
    WHERE value ->> 'id' = source_item ->> 'lineId'
    LIMIT 1;
    SELECT value INTO source_section
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(source_request.data -> 'sections') = 'array'
        THEN source_request.data -> 'sections' ELSE '[]'::JSONB END
    ) AS section(value)
    WHERE value ->> 'id' = source_item ->> 'sectionId'
    LIMIT 1;

    IF source_line IS NULL OR source_section IS NULL
      OR source_line ->> 'sectionId' IS DISTINCT FROM source_item ->> 'sectionId'
      OR source_line ->> 'status' IS DISTINCT FROM 'Quoted'
      OR source_section ->> 'status' IS DISTINCT FROM 'Active' THEN
      RAISE EXCEPTION 'Every client quotation source must be an active, Quoted line for the same section.' USING ERRCODE = '23514';
    END IF;

    IF NULLIF(source_item ->> 'optionKey', '') IS NULL THEN
      source_quote := source_line -> 'quotes' -> 0;
    ELSE
      SELECT value INTO source_quote
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(source_line -> 'quotes') = 'array'
          THEN source_line -> 'quotes' ELSE '[]'::JSONB END
      ) AS quote(value)
      WHERE value ->> 'optionId' = source_item ->> 'optionKey'
      LIMIT 1;
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(source_section #> '{data,options}') = 'array'
            THEN source_section #> '{data,options}' ELSE '[]'::JSONB END
        ) AS option(value)
        WHERE value ->> 'id' = source_item ->> 'optionKey'
      ) THEN
        RAISE EXCEPTION 'Client quotation source option was not found in its section.' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF source_quote IS NULL OR COALESCE((source_quote ->> 'premium')::NUMERIC, 0) <= 0
      OR source_quote ->> 'currency' IS DISTINCT FROM NEW.data ->> 'currency' THEN
      RAISE EXCEPTION 'Every client quotation source must have a positive premium in the quotation currency.' USING ERRCODE = '23514';
    END IF;
    IF source_quote ->> 'validUntil' IS NOT NULL
      AND (
        (source_quote ->> 'validUntil')::DATE < CURRENT_DATE
        OR (source_quote ->> 'validUntil')::DATE < (NEW.data ->> 'validUntil')::DATE
      )
      AND COALESCE((NEW.data ->> 'sourceValidityConfirmed')::BOOLEAN, FALSE) IS NOT TRUE THEN
      RAISE EXCEPTION 'Confirm the carrier quote validity warning before saving this quotation.' USING ERRCODE = '23514';
    END IF;
      source_line := NULL;
      source_section := NULL;
      source_quote := NULL;
    END LOOP;
  END IF;

  IF COALESCE((NEW.data ->> 'totalPremium')::NUMERIC, 0) <= 0
    OR COALESCE((NEW.data ->> 'totalSumInsured')::NUMERIC, 0) <= 0
    OR NULLIF(btrim(NEW.data #>> '{addressee,name}'), '') IS NULL
    OR NULLIF(btrim(NEW.data #>> '{addressee,contactId}'), '') IS NULL
    OR NULLIF(btrim(NEW.data ->> 'preparedBy'), '') IS NULL THEN
    RAISE EXCEPTION 'Client quotations require positive totals, an addressee, and a preparer.' USING ERRCODE = '23514';
  END IF;

  IF NEW.data ->> 'status' IN ('Issued', 'Accepted')
    AND (
      NULLIF(NEW.data ->> 'issuedAt', '') IS NULL
      OR NULLIF(NEW.data ->> 'validUntil', '') IS NULL
      OR (NEW.data ->> 'issuedAt')::DATE > (NEW.data ->> 'validUntil')::DATE
      OR (NEW.data ->> 'validUntil')::DATE < CURRENT_DATE
      OR NULLIF(btrim(NEW.data ->> 'authorizedBy'), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Issued quotations require a valid term and an authorizer.' USING ERRCODE = '23514';
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

COMMIT;
