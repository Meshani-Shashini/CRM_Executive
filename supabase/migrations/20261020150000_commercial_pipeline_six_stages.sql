DO $$
DECLARE
  default_pipeline_id TEXT;
  v_target_order INTEGER;
  v_target_name TEXT;
  v_target_id TEXT;
  v_fallback_id TEXT;
BEGIN
  SELECT COALESCE(data ->> 'id', record_id)
  INTO default_pipeline_id
  FROM public.tenant_records
  WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
    AND resource = 'pipelines'
    AND data ->> 'code' = 'COMMERCIAL'
  ORDER BY (data ->> 'isActive')::BOOLEAN DESC NULLS LAST
  LIMIT 1;

  IF default_pipeline_id IS NULL THEN
    default_pipeline_id := '00000000-0000-4000-8000-000000000100';
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES (
      '00000000-0000-4000-8000-000000000001',
      'pipelines',
      default_pipeline_id,
      jsonb_build_object(
        'id', default_pipeline_id,
        'tenantId', '00000000-0000-4000-8000-000000000001',
        'name', 'Commercial Brokerage',
        'code', 'COMMERCIAL',
        'isActive', TRUE
      )
    );
  ELSE
    UPDATE public.tenant_records
    SET data = jsonb_set(data, '{isActive}', 'true'::JSONB, TRUE)
    WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
      AND resource = 'pipelines'
      AND COALESCE(data ->> 'id', record_id) = default_pipeline_id;
  END IF;

  CREATE TEMP TABLE commercial_stage_mapping (
    old_stage_id TEXT PRIMARY KEY,
    old_stage_name TEXT NOT NULL,
    target_order INTEGER NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE commercial_stage_targets (
    stage_order INTEGER PRIMARY KEY,
    stage_name TEXT NOT NULL,
    stage_id TEXT NOT NULL UNIQUE
  ) ON COMMIT DROP;

  INSERT INTO commercial_stage_mapping (old_stage_id, old_stage_name, target_order)
  SELECT
    stage.record_id,
    stage.data ->> 'name',
    CASE LOWER(TRIM(stage.data ->> 'name'))
      WHEN 'fact-finding & risk survey' THEN 1
      WHEN 'qualified (discovery)' THEN 1
      WHEN 'lead identified' THEN 1
      WHEN 'market placement / outender' THEN 2
      WHEN 'market placement / tender' THEN 2
      WHEN 'solution alignment' THEN 2
      WHEN 'solution alignment (demo/quote request)' THEN 2
      WHEN 'contact made' THEN 2
      WHEN 'key person identified' THEN 2
      WHEN 'quote comparison & presentation' THEN 3
      WHEN 'quote comparison presented' THEN 3
      WHEN 'proposal / business case' THEN 3
      WHEN 'quoted' THEN 3
      WHEN 'underwriter negotiation' THEN 4
      WHEN 'negotiation & legal' THEN 4
      WHEN 'negotiation & legal (mira compliance)' THEN 4
      WHEN 'internal slip' THEN 4
      WHEN 'policy bound / won' THEN 5
      WHEN 'policy bound / won , lost / declined' THEN 5
      WHEN 'closed-won' THEN 5
      WHEN 'lost / declined' THEN 6
      WHEN 'closed-lost' THEN 6
      ELSE CASE
        WHEN stage.data ->> 'stageOrder' ~ '^[1-6]$'
          THEN (stage.data ->> 'stageOrder')::INTEGER
        ELSE NULL
      END
    END
  FROM public.tenant_records AS stage
  WHERE stage.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND stage.resource = 'pipeline-stages'
    AND stage.data ->> 'pipelineId' = default_pipeline_id
  ON CONFLICT (old_stage_id) DO NOTHING;

  INSERT INTO commercial_stage_mapping (old_stage_id, old_stage_name, target_order)
  VALUES
    ('00000000-0000-4000-8000-000000000105', 'Policy Bound / won', 5),
    ('00000000-0000-4000-8000-000000000106', 'Lost / Declined', 6)
  ON CONFLICT (old_stage_id) DO NOTHING;

  FOR v_target_order, v_target_name IN
    SELECT stage_order, stage_name
    FROM (VALUES
      (1, 'Fact-Finding & Risk Survey'),
      (2, 'Market Placement / Outender'),
      (3, 'Quote Comparison & Presentation'),
      (4, 'Underwriter Negotiation'),
      (5, 'Policy Bound / won'),
      (6, 'Lost / Declined')
    ) AS stages(stage_order, stage_name)
  LOOP
    SELECT stage.record_id
    INTO v_target_id
    FROM commercial_stage_mapping AS mapping
    JOIN public.tenant_records AS stage
      ON stage.tenant_id = '00000000-0000-4000-8000-000000000001'
      AND stage.resource = 'pipeline-stages'
      AND stage.record_id = mapping.old_stage_id
    WHERE mapping.target_order = v_target_order
    ORDER BY
      CASE WHEN stage.data ->> 'name' = v_target_name THEN 0 ELSE 1 END,
      stage.record_id
    LIMIT 1;

    IF v_target_id IS NULL THEN
      v_fallback_id := CASE v_target_order
        WHEN 1 THEN '00000000-0000-4000-8000-000000000101'
        WHEN 2 THEN '00000000-0000-4000-8000-000000000102'
        WHEN 3 THEN '00000000-0000-4000-8000-000000000103'
        WHEN 4 THEN '00000000-0000-4000-8000-000000000104'
        WHEN 5 THEN '00000000-0000-4000-8000-000000000105'
        ELSE '00000000-0000-4000-8000-000000000106'
      END;

      IF EXISTS (
        SELECT 1
        FROM public.tenant_records
        WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
          AND resource = 'pipeline-stages'
          AND record_id = v_fallback_id
          AND data ->> 'pipelineId' IS DISTINCT FROM default_pipeline_id
      ) OR EXISTS (
        SELECT 1
        FROM commercial_stage_targets
        WHERE stage_id = v_fallback_id
      ) THEN
        v_fallback_id := default_pipeline_id || '-stage-' || v_target_order::TEXT;
      END IF;

      WHILE EXISTS (
        SELECT 1
        FROM public.tenant_records
        WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
          AND resource = 'pipeline-stages'
          AND record_id = v_fallback_id
          AND data ->> 'pipelineId' IS DISTINCT FROM default_pipeline_id
      ) OR EXISTS (
        SELECT 1
        FROM commercial_stage_targets
        WHERE stage_id = v_fallback_id
      ) LOOP
        v_fallback_id := v_fallback_id || '-new';
      END LOOP;

      v_target_id := v_fallback_id;
    END IF;

    INSERT INTO commercial_stage_targets (stage_order, stage_name, stage_id)
    VALUES (v_target_order, v_target_name, v_target_id);
    v_target_id := NULL;
  END LOOP;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{toStageId}', TO_JSONB(target.stage_id), TRUE)
  FROM commercial_stage_mapping AS mapping
  JOIN commercial_stage_targets AS target
    ON target.stage_order = mapping.target_order
  WHERE history.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND history.resource = 'stage-history'
    AND history.data ->> 'toStageId' = mapping.old_stage_id
    AND mapping.old_stage_id <> target.stage_id;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{fromStageId}', TO_JSONB(target.stage_id), TRUE)
  FROM commercial_stage_mapping AS mapping
  JOIN commercial_stage_targets AS target
    ON target.stage_order = mapping.target_order
  WHERE history.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND history.resource = 'stage-history'
    AND history.data ->> 'fromStageId' = mapping.old_stage_id
    AND mapping.old_stage_id <> target.stage_id;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{toStageId}', TO_JSONB(lost_target.stage_id), TRUE)
  FROM commercial_stage_targets AS won_target
  JOIN commercial_stage_targets AS lost_target
    ON lost_target.stage_order = 6
  WHERE history.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND history.resource = 'stage-history'
    AND history.data ->> 'toStageId' = won_target.stage_id
    AND history.data ->> 'outcome' = 'lost'
    AND won_target.stage_order = 5;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{outcome}', '"lost"'::JSONB, TRUE)
  FROM commercial_stage_targets AS lost_target
  WHERE history.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND history.resource = 'stage-history'
    AND history.data ->> 'toStageId' = lost_target.stage_id
    AND lost_target.stage_order = 6;

  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
    jsonb_set(
      deal.data,
      '{stage}',
      TO_JSONB(CASE
        WHEN LOWER(mapping.old_stage_name) IN ('policy bound / won , lost / declined', 'closed-lost')
          AND LOWER(COALESCE(deal.data ->> 'disposition', '')) = 'lost'
          THEN lost_target.stage_name
        ELSE target.stage_name
      END),
      TRUE
    ),
    '{pipelineId}',
    TO_JSONB(default_pipeline_id),
    TRUE
  )
  FROM commercial_stage_mapping AS mapping
  JOIN commercial_stage_targets AS target
    ON target.stage_order = mapping.target_order
  JOIN commercial_stage_targets AS lost_target
    ON lost_target.stage_order = 6
  WHERE deal.tenant_id = '00000000-0000-4000-8000-000000000001'
    AND deal.resource = 'deals'
    AND (deal.data ->> 'pipelineId' = default_pipeline_id OR deal.data ->> 'pipelineId' IS NULL)
    AND deal.data ->> 'stage' = mapping.old_stage_name;

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{disposition}', '"lost"'::JSONB, TRUE)
  WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
    AND resource = 'deals'
    AND data ->> 'pipelineId' = default_pipeline_id
    AND data ->> 'stage' = 'Lost / Declined';

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{disposition}', '"won"'::JSONB, TRUE)
  WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
    AND resource = 'deals'
    AND data ->> 'pipelineId' = default_pipeline_id
    AND data ->> 'stage' = 'Policy Bound / won';

  DELETE FROM public.tenant_records
  WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
    AND resource = 'pipeline-stages'
    AND data ->> 'pipelineId' = default_pipeline_id;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
  SELECT
    '00000000-0000-4000-8000-000000000001',
    'pipeline-stages',
    target.stage_id,
    jsonb_build_object(
      'id', target.stage_id,
      'pipelineId', default_pipeline_id,
      'name', target.stage_name,
      'stageOrder', target.stage_order,
      'winProbabilityPct', CASE target.stage_order
        WHEN 1 THEN 20
        WHEN 2 THEN 40
        WHEN 3 THEN 60
        WHEN 4 THEN 80
        WHEN 5 THEN 100
        ELSE 0
      END,
      'stagnationDaysThreshold', CASE target.stage_order
        WHEN 1 THEN 30
        WHEN 2 THEN 30
        WHEN 3 THEN 14
        WHEN 4 THEN 14
        ELSE 0
      END
    )
  FROM commercial_stage_targets AS target;
END;
$$;
