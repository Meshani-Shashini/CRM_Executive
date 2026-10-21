DO $$
DECLARE
  tenant UUID := '00000000-0000-4000-8000-000000000001';
  pipeline JSONB;
  stage JSONB;
  pipeline_id TEXT;
  stage_id TEXT;
  stage_index INTEGER;
BEGIN
  -- Keep the four workflow pipelines canonical while preserving existing records.
  FOR pipeline IN
    SELECT value FROM jsonb_array_elements('[
      {"code":"COMMERCIAL","name":"Commercial Lines"},
      {"code":"SME-RETAIL","name":"SME/Retail Fast-Track"},
      {"code":"RENEWALS","name":"Annual Policy Renewals"},
      {"code":"CLAIMS","name":"Claims Management"}
    ]'::JSONB)
  LOOP
    SELECT COALESCE(data ->> 'id', record_id)
    INTO pipeline_id
    FROM public.tenant_records
    WHERE tenant_id = tenant
      AND resource = 'pipelines'
      AND (data ->> 'code' = pipeline ->> 'code'
        OR (pipeline ->> 'code' = 'SME-RETAIL' AND data ->> 'code' = 'RETAIL'))
    ORDER BY (data ->> 'isActive')::BOOLEAN DESC NULLS LAST
    LIMIT 1;

    IF pipeline_id IS NULL THEN
      pipeline_id := 'workflow-' || lower(pipeline ->> 'code');
      INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
      VALUES (
        tenant, 'pipelines', pipeline_id,
        jsonb_build_object(
          'id', pipeline_id,
          'tenantId', tenant,
          'name', pipeline ->> 'name',
          'code', pipeline ->> 'code',
          'isActive', TRUE
        )
      );
    ELSE
      UPDATE public.tenant_records
      SET data = jsonb_set(
        jsonb_set(data, '{name}', to_jsonb(pipeline ->> 'name'), TRUE),
        '{code}', to_jsonb(pipeline ->> 'code'), TRUE
      )
      WHERE tenant_id = tenant AND resource = 'pipelines' AND record_id = pipeline_id;
    END IF;

    FOR stage, stage_index IN
      SELECT value, ordinality::INTEGER
      FROM jsonb_array_elements(
        CASE pipeline ->> 'code'
          WHEN 'COMMERCIAL' THEN '[
            {"name":"Fact-Finding & Risk Survey","probability":20,"threshold":30},
            {"name":"Market Placement / Outender","probability":40,"threshold":30},
            {"name":"Quote Comparison & Presentation","probability":60,"threshold":14},
            {"name":"Underwriter Negotiation","probability":80,"threshold":14},
            {"name":"Policy Bound / Won","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'SME-RETAIL' THEN '[
            {"name":"Inbound Lead","probability":20,"threshold":2},
            {"name":"Automated Quote Issued","probability":45,"threshold":2},
            {"name":"Payment Collection","probability":75,"threshold":7},
            {"name":"Policy Issued","probability":100,"threshold":0}
          ]'
          WHEN 'RENEWALS' THEN '[
            {"name":"Renewal Audit (90d out)","probability":20,"threshold":14},
            {"name":"Expiring Loss Run Review","probability":40,"threshold":14},
            {"name":"Market Re-tender","probability":60,"threshold":30},
            {"name":"Client Renewal Sign-off","probability":80,"threshold":14},
            {"name":"Renewed","probability":100,"threshold":0}
          ]'
          ELSE '[
            {"name":"Claim Notified","probability":20,"threshold":7},
            {"name":"Surveyor Assigned","probability":40,"threshold":14},
            {"name":"Adjuster Assessment","probability":60,"threshold":30},
            {"name":"Underwriter Settlement","probability":80,"threshold":30},
            {"name":"Cheque Dispatched","probability":100,"threshold":0}
          ]'
        END::JSONB
      ) WITH ORDINALITY
    LOOP
      SELECT record_id INTO stage_id
      FROM public.tenant_records
      WHERE tenant_id = tenant
        AND resource = 'pipeline-stages'
        AND data ->> 'pipelineId' = pipeline_id
        AND (data ->> 'stageOrder')::INTEGER = stage_index
      LIMIT 1;

      IF stage_id IS NULL THEN
        stage_id := pipeline_id || '-stage-' || stage_index::TEXT;
        INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
        VALUES (
          tenant, 'pipeline-stages', stage_id,
          jsonb_build_object(
            'id', stage_id, 'pipelineId', pipeline_id,
            'name', stage ->> 'name', 'stageOrder', stage_index,
            'winProbabilityPct', (stage ->> 'probability')::INTEGER,
            'stagnationDaysThreshold', (stage ->> 'threshold')::INTEGER
          )
        );
      ELSE
        UPDATE public.tenant_records
        SET data = jsonb_build_object(
          'id', stage_id, 'pipelineId', pipeline_id,
          'name', stage ->> 'name', 'stageOrder', stage_index,
          'winProbabilityPct', (stage ->> 'probability')::INTEGER,
          'stagnationDaysThreshold', (stage ->> 'threshold')::INTEGER
        )
        WHERE tenant_id = tenant AND resource = 'pipeline-stages' AND record_id = stage_id;
      END IF;
      stage_id := NULL;
    END LOOP;
    pipeline_id := NULL;
  END LOOP;

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{isActive}', 'false'::JSONB, TRUE)
  WHERE tenant_id = tenant
    AND resource = 'pipelines'
    AND COALESCE(data ->> 'code', '') NOT IN ('COMMERCIAL', 'SME-RETAIL', 'RENEWALS', 'CLAIMS');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_policy_bound_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bound_stage BOOLEAN;
  previous_bound_stage BOOLEAN;
  client_record public.tenant_records%ROWTYPE;
  renewal_pipeline public.tenant_records%ROWTYPE;
  renewal_stage public.tenant_records%ROWTYPE;
  expiry_date DATE;
  renewal_close_date DATE;
  invoice_id TEXT;
  renewal_id TEXT;
  renewal_value NUMERIC;
BEGIN
  IF NEW.resource <> 'deals' THEN
    RETURN NEW;
  END IF;

  bound_stage := lower(COALESCE(NEW.data ->> 'stage', '')) = 'policy bound / won';
  previous_bound_stage := TG_OP = 'UPDATE'
    AND lower(COALESCE(OLD.data ->> 'stage', '')) = 'policy bound / won';
  IF NOT bound_stage OR previous_bound_stage THEN
    RETURN NEW;
  END IF;

  invoice_id := 'invoice-for-' || NEW.record_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE tenant_id = NEW.tenant_id
      AND resource = 'invoices'
      AND data ->> 'linkedDealId' = NEW.record_id
  ) THEN
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES (
      NEW.tenant_id,
      'invoices',
      invoice_id,
      jsonb_build_object(
        'id', invoice_id,
        'number', 'INV-' || right(NEW.record_id, 8),
        'clientId', COALESCE(NEW.data ->> 'clientId', ''),
        'clientName', COALESCE(NEW.data ->> 'client', ''),
        'insurer', COALESCE(NEW.data ->> 'insurer', 'Not assigned'),
        'policyNo', NEW.record_id,
        'issueDate', CURRENT_DATE,
        'dueDate', CURRENT_DATE + 30,
        'status', 'Pending',
        'items', jsonb_build_array(jsonb_build_object(
          'description', 'Premium for ' || COALESCE(NEW.data ->> 'product', 'Policy'),
          'qty', 1,
          'unitPrice', COALESCE((NEW.data ->> 'value')::NUMERIC, 0),
          'vatRate', 0
        )),
        'installments', jsonb_build_array(jsonb_build_object(
          'id', invoice_id || '-installment',
          'label', 'Single Payment',
          'due', CURRENT_DATE + 30,
          'amount', COALESCE((NEW.data ->> 'value')::NUMERIC, 0),
          'paid', FALSE
        )),
        'currency', COALESCE(NEW.data ->> 'currency', 'MVR'),
        'linkedDealId', NEW.record_id
      )
    );
  END IF;

  SELECT * INTO client_record
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'clients'
    AND (
      (NEW.data ->> 'clientId' IS NOT NULL AND data ->> 'id' = NEW.data ->> 'clientId')
      OR lower(data ->> 'name') = lower(NEW.data ->> 'client')
    )
  LIMIT 1;

  expiry_date := NULLIF(COALESCE(NEW.data ->> 'policyExpiry', client_record.data ->> 'expiry'), '')::DATE;
  IF expiry_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO renewal_pipeline
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipelines'
    AND data ->> 'code' = 'RENEWALS'
    AND COALESCE((data ->> 'isActive')::BOOLEAN, FALSE)
  LIMIT 1;
  IF renewal_pipeline.record_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO renewal_stage
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipeline-stages'
    AND data ->> 'pipelineId' = COALESCE(renewal_pipeline.data ->> 'id', renewal_pipeline.record_id)
  ORDER BY (data ->> 'stageOrder')::INTEGER
  LIMIT 1;
  IF renewal_stage.record_id IS NULL THEN
    RETURN NEW;
  END IF;

  renewal_id := 'renewal-for-' || NEW.record_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE tenant_id = NEW.tenant_id AND resource = 'deals' AND record_id = renewal_id
  ) THEN
    renewal_close_date := expiry_date - 90;
    renewal_value := COALESCE((client_record.data ->> 'premium')::NUMERIC, (NEW.data ->> 'value')::NUMERIC, 0);
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES (
      NEW.tenant_id,
      'deals',
      renewal_id,
      jsonb_build_object(
        'id', renewal_id,
        'pipelineId', COALESCE(renewal_pipeline.data ->> 'id', renewal_pipeline.record_id),
        'createdAt', NOW(),
        'renewalForClientId', NULLIF(client_record.data ->> 'id', ''),
        'renewalForDealId', NEW.record_id,
        'renewalExpiry', expiry_date,
        'policyExpiry', expiry_date,
        'client', COALESCE(NEW.data ->> 'client', client_record.data ->> 'name', ''),
        'product', COALESCE(NEW.data ->> 'product', 'Insurance renewal'),
        'value', renewal_value,
        'weighted', renewal_value * ((renewal_stage.data ->> 'winProbabilityPct')::NUMERIC / 100),
        'currency', COALESCE(NEW.data ->> 'currency', 'MVR'),
        'stage', renewal_stage.data ->> 'name',
        'probability', (renewal_stage.data ->> 'winProbabilityPct')::INTEGER,
        'ownerId', COALESCE(NEW.data ->> 'ownerId', client_record.data ->> 'ownerId', ''),
        'closeDate', renewal_close_date,
        'insurer', COALESCE(NEW.data ->> 'insurer', client_record.data ->> 'insurer', 'Not assigned'),
        'nextActivityAt', renewal_close_date,
        'nextActivityTitle', 'Start 90-day renewal retention review'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_records_policy_bound_side_effects ON public.tenant_records;
CREATE TRIGGER tenant_records_policy_bound_side_effects
AFTER INSERT OR UPDATE OF data ON public.tenant_records
FOR EACH ROW EXECUTE FUNCTION public.create_policy_bound_side_effects();
