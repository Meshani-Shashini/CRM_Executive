DO $$
DECLARE
  tenant UUID := '00000000-0000-4000-8000-000000000001';
  spec JSONB;
  stage JSONB;
  aliases TEXT[];
  pipeline_id TEXT;
  stage_id TEXT;
  stage_order INTEGER;
  stage_count INTEGER;
  probability INTEGER;
  normalized_stage TEXT;
BEGIN
  FOR spec IN
    SELECT value
    FROM jsonb_array_elements('[
      {
        "code":"COMMERCIAL",
        "name":"Primary Commercial Lines Placement Pipeline",
        "aliases":["COMMERCIAL","COMMERCIAL_ENG"],
        "stages":[
          {"name":"Fact-Finding & Risk Survey","probability":20,"sla":10},
          {"name":"Market Tender & Placing Slip Submission","probability":40,"sla":14},
          {"name":"Comparative Analysis & Presentation","probability":60,"sla":7},
          {"name":"Underwriter Negotiation & Structuring","probability":80,"sla":5},
          {"name":"Policy Bound / Won","probability":100,"sla":0},
          {"name":"Lost / Market Declined","probability":0,"sla":0}
        ]
      },
      {
        "code":"SME_VELOCITY",
        "name":"Retail, SME & Velocity Packages",
        "aliases":["SME_VELOCITY","SME-RETAIL","RETAIL"],
        "stages":[
          {"name":"Intake & Rating","probability":20,"sla":2},
          {"name":"Quoted","probability":45,"sla":2},
          {"name":"Client Confirmation","probability":75,"sla":3},
          {"name":"Payment & Immediate Cover","probability":100,"sla":0}
        ]
      },
      {
        "code":"RENEWALS",
        "name":"Annual Policy Renewals Pipeline",
        "aliases":["RENEWALS"],
        "stages":[
          {"name":"T-90d Audit","probability":20,"sla":14},
          {"name":"T-60d Re-tender","probability":40,"sla":14},
          {"name":"T-30d Presentation","probability":60,"sla":7},
          {"name":"T-15d Sign-Off","probability":80,"sla":5},
          {"name":"Renewed & Re-Invoiced","probability":100,"sla":0}
        ]
      }
    ]'::JSONB)
  LOOP
    aliases := ARRAY(SELECT jsonb_array_elements_text(spec -> 'aliases'));
    SELECT COALESCE(data ->> 'id', record_id)
    INTO pipeline_id
    FROM public.tenant_records
    WHERE tenant_id = tenant
      AND resource = 'pipelines'
      AND data ->> 'code' = ANY(aliases)
    ORDER BY
      CASE WHEN data ->> 'code' = spec ->> 'code' THEN 0 ELSE 1 END,
      COALESCE((data ->> 'isActive')::BOOLEAN, FALSE) DESC
    LIMIT 1;

    IF pipeline_id IS NULL THEN
      pipeline_id := 'bms-' || lower(spec ->> 'code');
      INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
      VALUES (
        tenant, 'pipelines', pipeline_id,
        jsonb_build_object(
          'id', pipeline_id,
          'tenantId', tenant,
          'name', spec ->> 'name',
          'code', spec ->> 'code',
          'isActive', TRUE
        )
      );
    ELSE
      UPDATE public.tenant_records
      SET data = jsonb_set(
        jsonb_set(
          jsonb_set(data, '{name}', to_jsonb(spec ->> 'name'), TRUE),
          '{code}', to_jsonb(spec ->> 'code'), TRUE
        ),
        '{isActive}', 'true'::JSONB, TRUE
      )
      WHERE tenant_id = tenant
        AND resource = 'pipelines'
        AND COALESCE(data ->> 'id', record_id) = pipeline_id;
    END IF;

    stage_count := jsonb_array_length(spec -> 'stages');
    FOR stage, stage_order IN
      SELECT value, ordinality::INTEGER
      FROM jsonb_array_elements(spec -> 'stages') WITH ORDINALITY
    LOOP
      SELECT record_id INTO stage_id
      FROM public.tenant_records
      WHERE tenant_id = tenant
        AND resource = 'pipeline-stages'
        AND data ->> 'pipelineId' = pipeline_id
        AND (data ->> 'stageOrder')::INTEGER = stage_order
      ORDER BY CASE WHEN data ->> 'name' = stage ->> 'name' THEN 0 ELSE 1 END, record_id
      LIMIT 1;

      IF stage_id IS NULL THEN
        stage_id := pipeline_id || '-stage-' || stage_order::TEXT;
        INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
        VALUES (
          tenant, 'pipeline-stages', stage_id,
          jsonb_build_object(
            'id', stage_id,
            'pipelineId', pipeline_id,
            'name', stage ->> 'name',
            'stageOrder', stage_order,
            'winProbabilityPct', (stage ->> 'probability')::INTEGER,
            'stagnationDaysThreshold', (stage ->> 'sla')::INTEGER
          )
        );
      ELSE
        UPDATE public.tenant_records
        SET data = jsonb_build_object(
          'id', stage_id,
          'pipelineId', pipeline_id,
          'name', stage ->> 'name',
          'stageOrder', stage_order,
          'winProbabilityPct', (stage ->> 'probability')::INTEGER,
          'stagnationDaysThreshold', (stage ->> 'sla')::INTEGER
        )
        WHERE tenant_id = tenant
          AND resource = 'pipeline-stages'
          AND record_id = stage_id;
      END IF;
      stage_id := NULL;
    END LOOP;

    UPDATE public.tenant_records AS history
    SET data = jsonb_set(history.data, '{toStageId}', to_jsonb(target.record_id), TRUE)
    FROM public.tenant_records AS old_stage
    JOIN public.tenant_records AS target
      ON target.tenant_id = tenant
      AND target.resource = 'pipeline-stages'
      AND target.data ->> 'pipelineId' = pipeline_id
      AND (target.data ->> 'stageOrder')::INTEGER = stage_count
    WHERE history.tenant_id = tenant
      AND history.resource = 'stage-history'
      AND history.data ->> 'toStageId' = old_stage.record_id
      AND old_stage.tenant_id = tenant
      AND old_stage.resource = 'pipeline-stages'
      AND old_stage.data ->> 'pipelineId' = pipeline_id
      AND (old_stage.data ->> 'stageOrder')::INTEGER > stage_count;

    UPDATE public.tenant_records AS history
    SET data = jsonb_set(history.data, '{fromStageId}', to_jsonb(target.record_id), TRUE)
    FROM public.tenant_records AS old_stage
    JOIN public.tenant_records AS target
      ON target.tenant_id = tenant
      AND target.resource = 'pipeline-stages'
      AND target.data ->> 'pipelineId' = pipeline_id
      AND (target.data ->> 'stageOrder')::INTEGER = stage_count
    WHERE history.tenant_id = tenant
      AND history.resource = 'stage-history'
      AND history.data ->> 'fromStageId' = old_stage.record_id
      AND old_stage.tenant_id = tenant
      AND old_stage.resource = 'pipeline-stages'
      AND old_stage.data ->> 'pipelineId' = pipeline_id
      AND (old_stage.data ->> 'stageOrder')::INTEGER > stage_count;

    DELETE FROM public.tenant_records
    WHERE tenant_id = tenant
      AND resource = 'pipeline-stages'
      AND data ->> 'pipelineId' = pipeline_id
      AND (data ->> 'stageOrder')::INTEGER > stage_count;
    pipeline_id := NULL;
  END LOOP;

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{isActive}', 'false'::JSONB, TRUE)
  WHERE tenant_id = tenant
    AND resource = 'pipelines'
    AND COALESCE(data ->> 'code', '') NOT IN ('COMMERCIAL', 'SME_VELOCITY', 'RENEWALS');

  SELECT COALESCE(data ->> 'id', record_id) INTO pipeline_id
  FROM public.tenant_records
  WHERE tenant_id = tenant AND resource = 'pipelines' AND data ->> 'code' = 'COMMERCIAL'
  LIMIT 1;
  SELECT COALESCE(data ->> 'id', record_id) INTO stage_id
  FROM public.tenant_records
  WHERE tenant_id = tenant AND resource = 'pipelines' AND data ->> 'code' = 'SME_VELOCITY'
  LIMIT 1;
  SELECT COALESCE(data ->> 'id', record_id) INTO normalized_stage
  FROM public.tenant_records
  WHERE tenant_id = tenant AND resource = 'pipelines' AND data ->> 'code' = 'RENEWALS'
  LIMIT 1;

  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
    deal.data,
    '{pipelineId}',
    to_jsonb(CASE
      WHEN old_pipeline.data ->> 'code' = 'RENEWALS' THEN normalized_stage
      WHEN old_pipeline.data ->> 'code' = 'SME_VELOCITY' THEN stage_id
      ELSE pipeline_id
    END),
    TRUE
  )
  FROM public.tenant_records AS old_pipeline
  WHERE deal.tenant_id = tenant
    AND deal.resource = 'deals'
    AND old_pipeline.tenant_id = tenant
    AND old_pipeline.resource = 'pipelines'
    AND old_pipeline.data ->> 'id' = deal.data ->> 'pipelineId';

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{pipelineId}', to_jsonb(pipeline_id), TRUE)
  WHERE tenant_id = tenant AND resource = 'deals' AND data ->> 'pipelineId' IS NULL;

  UPDATE public.tenant_records AS lead
  SET data = jsonb_set(
    jsonb_set(lead.data, '{pipelineId}', to_jsonb(pipeline_id), TRUE),
    '{funnelStage}',
    to_jsonb(CASE
      WHEN lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%lost%' THEN 'Lost / Market Declined'
      WHEN lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%quote%'
        OR lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%present%' THEN 'Comparative Analysis & Presentation'
      WHEN lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%market%'
        OR lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%contact%'
        OR lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%slip%' THEN 'Market Tender & Placing Slip Submission'
      WHEN lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%negotiat%' THEN 'Underwriter Negotiation & Structuring'
      WHEN lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%bound%'
        OR lower(COALESCE(lead.data ->> 'funnelStage', '')) LIKE '%won%' THEN 'Policy Bound / Won'
      ELSE 'Fact-Finding & Risk Survey'
    END),
    TRUE
  )
  WHERE lead.tenant_id = tenant AND lead.resource = 'leads';

  WITH normalized AS (
    SELECT tenant_id, record_id,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%lost%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%declined%' THEN 'Lost / Market Declined'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%won%' THEN 'Policy Bound / Won'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%negotiat%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%structur%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%internal%' THEN 'Underwriter Negotiation & Structuring'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%comparative%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%proposal%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%present%' THEN 'Comparative Analysis & Presentation'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%market%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%placement%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%tender%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%contact%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%slip%' THEN 'Market Tender & Placing Slip Submission'
        ELSE 'Fact-Finding & Risk Survey'
      END AS stage_name,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%lost%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%declined%' THEN 0
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%won%' THEN 100
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%negotiat%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%structur%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%internal%' THEN 80
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%comparative%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%proposal%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%present%' THEN 60
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%market%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%placement%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%tender%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%contact%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%slip%' THEN 40
        ELSE 20
      END AS probability
    FROM public.tenant_records
    WHERE tenant_id = tenant AND resource = 'deals' AND data ->> 'pipelineId' = pipeline_id
  )
  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
    jsonb_set(
      jsonb_set(deal.data, '{stage}', to_jsonb(normalized.stage_name), TRUE),
      '{probability}', to_jsonb(normalized.probability), TRUE
    ),
    '{weighted}',
    to_jsonb(COALESCE(NULLIF(deal.data ->> 'value', '')::NUMERIC, 0) * normalized.probability / 100),
    TRUE
  )
  FROM normalized
  WHERE deal.tenant_id = normalized.tenant_id
    AND deal.resource = 'deals'
    AND deal.record_id = normalized.record_id;

  WITH normalized AS (
    SELECT tenant_id, record_id,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%renew%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%' THEN 'Renewed & Re-Invoiced'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%sign%' THEN 'T-15d Sign-Off'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%present%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%' THEN 'T-30d Presentation'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%tender%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%market%' THEN 'T-60d Re-tender'
        ELSE 'T-90d Audit'
      END AS stage_name,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%renew%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%' THEN 100
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%sign%' THEN 80
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%present%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%' THEN 60
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%tender%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%market%' THEN 40
        ELSE 20
      END AS probability
    FROM public.tenant_records
    WHERE tenant_id = tenant AND resource = 'deals' AND data ->> 'pipelineId' = normalized_stage
  )
  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
    jsonb_set(
      jsonb_set(deal.data, '{stage}', to_jsonb(normalized.stage_name), TRUE),
      '{probability}', to_jsonb(normalized.probability), TRUE
    ),
    '{weighted}',
    to_jsonb(COALESCE(NULLIF(deal.data ->> 'value', '')::NUMERIC, 0) * normalized.probability / 100),
    TRUE
  )
  FROM normalized
  WHERE deal.tenant_id = normalized.tenant_id
    AND deal.resource = 'deals'
    AND deal.record_id = normalized.record_id;

  WITH normalized AS (
    SELECT tenant_id, record_id,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%payment%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%issued%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%' THEN 'Payment & Immediate Cover'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%confirm%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%client%' THEN 'Client Confirmation'
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%' THEN 'Quoted'
        ELSE 'Intake & Rating'
      END AS stage_name,
      CASE
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%payment%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%issued%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%bound%' THEN 100
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%confirm%'
          OR lower(COALESCE(data ->> 'stage', '')) LIKE '%client%' THEN 75
        WHEN lower(COALESCE(data ->> 'stage', '')) LIKE '%quote%' THEN 45
        ELSE 20
      END AS probability
    FROM public.tenant_records
    WHERE tenant_id = tenant AND resource = 'deals' AND data ->> 'pipelineId' = stage_id
  )
  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
    jsonb_set(
      jsonb_set(deal.data, '{stage}', to_jsonb(normalized.stage_name), TRUE),
      '{probability}', to_jsonb(normalized.probability), TRUE
    ),
    '{weighted}',
    to_jsonb(COALESCE(NULLIF(deal.data ->> 'value', '')::NUMERIC, 0) * normalized.probability / 100),
    TRUE
  )
  FROM normalized
  WHERE deal.tenant_id = normalized.tenant_id
    AND deal.resource = 'deals'
    AND deal.record_id = normalized.record_id;

  UPDATE public.policy_types
  SET default_pipeline_code = 'COMMERCIAL'
  WHERE tenant_id = tenant;

  UPDATE public.tenant_records AS product
  SET data = jsonb_set(product.data, '{defaultPipelineCode}', '"COMMERCIAL"'::JSONB, TRUE)
  WHERE product.tenant_id = tenant
    AND product.resource = 'products';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_bms_alternative_bound_side_effects()
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

  bound_stage := lower(COALESCE(NEW.data ->> 'stage', '')) IN (
    'payment & immediate cover',
    'renewed & re-invoiced'
  );
  previous_bound_stage := TG_OP = 'UPDATE'
    AND lower(COALESCE(OLD.data ->> 'stage', '')) IN (
      'payment & immediate cover',
      'renewed & re-invoiced'
    );
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
      NEW.tenant_id, 'invoices', invoice_id,
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
      NEW.tenant_id, 'deals', renewal_id,
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
        'productCode', NEW.data ->> 'productCode',
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

DROP TRIGGER IF EXISTS tenant_records_bms_alternative_bound_side_effects ON public.tenant_records;
CREATE TRIGGER tenant_records_bms_alternative_bound_side_effects
AFTER INSERT OR UPDATE OF data ON public.tenant_records
FOR EACH ROW EXECUTE FUNCTION public.create_bms_alternative_bound_side_effects();
