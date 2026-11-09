DO $$
DECLARE
  pipeline RECORD;
  stage_order INTEGER;
  stage_name TEXT;
  stage_probability INTEGER;
  stage_sla INTEGER;
  stage_id TEXT;
  fallback_id TEXT;
BEGIN
  CREATE TEMP TABLE deal_pipeline_stage_targets (
    tenant_id UUID NOT NULL,
    pipeline_id TEXT NOT NULL,
    stage_order INTEGER NOT NULL,
    stage_id TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    probability INTEGER NOT NULL,
    sla INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, pipeline_id, stage_order)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE deal_pipeline_stage_sources (
    tenant_id UUID NOT NULL,
    pipeline_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    stage_order INTEGER NOT NULL,
    is_closed_won BOOLEAN NOT NULL,
    is_closed_lost BOOLEAN NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE deal_pipeline_stage_mapping (
    tenant_id UUID NOT NULL,
    pipeline_id TEXT NOT NULL,
    old_stage_id TEXT NOT NULL,
    old_stage_name TEXT NOT NULL,
    target_stage_id TEXT NOT NULL,
    target_stage_name TEXT NOT NULL,
    outcome TEXT
  ) ON COMMIT DROP;

  INSERT INTO deal_pipeline_stage_sources (
    tenant_id, pipeline_id, stage_id, stage_name, stage_order, is_closed_won, is_closed_lost
  )
  SELECT
    stage.tenant_id,
    COALESCE(pipeline.data ->> 'id', pipeline.record_id),
    COALESCE(stage.data ->> 'id', stage.record_id),
    COALESCE(stage.data ->> 'name', ''),
    CASE
      WHEN stage.data ->> 'stageOrder' ~ '^[0-9]+$'
        THEN (stage.data ->> 'stageOrder')::INTEGER
      ELSE 1
    END,
    COALESCE((stage.data ->> 'isClosedWon')::BOOLEAN, FALSE)
      OR LOWER(COALESCE(stage.data ->> 'name', '')) ~ '(won|bound|renewed|immediate cover|paid)',
    COALESCE((stage.data ->> 'isClosedLost')::BOOLEAN, FALSE)
      OR LOWER(COALESCE(stage.data ->> 'name', '')) ~ '(lost|declined|lapsed)'
  FROM public.tenant_records AS pipeline
  JOIN public.tenant_records AS stage
    ON stage.tenant_id = pipeline.tenant_id
    AND stage.resource = 'pipeline-stages'
    AND stage.data ->> 'pipelineId' = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
  WHERE pipeline.resource = 'pipelines'
    AND COALESCE(LOWER(pipeline.data ->> 'isActive'), 'false') = 'true';

  FOR pipeline IN
    SELECT tenant_id, COALESCE(data ->> 'id', record_id) AS pipeline_id
    FROM public.tenant_records
    WHERE resource = 'pipelines'
      AND COALESCE(LOWER(data ->> 'isActive'), 'false') = 'true'
  LOOP
    FOR stage_order IN 1..9 LOOP
      SELECT stages.name, stages.probability, stages.sla
      INTO stage_name, stage_probability, stage_sla
      FROM (VALUES
        (1, 'Identified', 10, 3),
        (2, 'Contact Made', 20, 5),
        (3, 'Key Person Identified', 30, 5),
        (4, 'Intro Mail', 40, 5),
        (5, 'Meetings', 50, 7),
        (6, 'Requirements Identified', 60, 5),
        (7, 'Quotation / Underwriting', 70, 7),
        (8, 'Quoted / Proposed', 80, 5),
        (9, 'Review and Follow up', 90, 3)
      ) AS stages(order_no, name, probability, sla)
      WHERE stages.order_no = stage_order;

      SELECT COALESCE(data ->> 'id', record_id)
      INTO stage_id
      FROM public.tenant_records
      WHERE tenant_id = pipeline.tenant_id
        AND resource = 'pipeline-stages'
        AND data ->> 'pipelineId' = pipeline.pipeline_id
        AND CASE
          WHEN data ->> 'stageOrder' ~ '^[0-9]+$'
            THEN (data ->> 'stageOrder')::INTEGER
          ELSE -1
        END = stage_order
      ORDER BY CASE WHEN data ->> 'name' = stage_name THEN 0 ELSE 1 END, record_id
      LIMIT 1;

      IF stage_id IS NULL THEN
        fallback_id := pipeline.pipeline_id || '-stage-' || stage_order::TEXT;
        WHILE EXISTS (
          SELECT 1
          FROM public.tenant_records
          WHERE tenant_id = pipeline.tenant_id
            AND resource = 'pipeline-stages'
            AND record_id = fallback_id
        ) LOOP
          fallback_id := fallback_id || '-new';
        END LOOP;
        stage_id := fallback_id;

        INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
        VALUES (
          pipeline.tenant_id,
          'pipeline-stages',
          stage_id,
          jsonb_build_object(
            'id', stage_id,
            'pipelineId', pipeline.pipeline_id,
            'name', stage_name,
            'shortLabel', stage_name,
            'purpose', stage_name,
            'stageOrder', stage_order,
            'winProbabilityPct', stage_probability,
            'stagnationDaysThreshold', stage_sla,
            'isClosedWon', FALSE,
            'isClosedLost', FALSE,
            'requiresApproval', FALSE
          ),
          NOW()
        );
      ELSE
        UPDATE public.tenant_records
        SET data = data || jsonb_build_object(
          'id', stage_id,
          'pipelineId', pipeline.pipeline_id,
          'name', stage_name,
          'shortLabel', stage_name,
          'purpose', stage_name,
          'stageOrder', stage_order,
          'winProbabilityPct', stage_probability,
          'stagnationDaysThreshold', stage_sla,
          'isClosedWon', FALSE,
          'isClosedLost', FALSE,
          'requiresApproval', FALSE
        ),
        updated_at = NOW()
        WHERE tenant_id = pipeline.tenant_id
          AND resource = 'pipeline-stages'
          AND COALESCE(data ->> 'id', record_id) = stage_id;
      END IF;

      INSERT INTO deal_pipeline_stage_targets (
        tenant_id, pipeline_id, stage_order, stage_id, stage_name, probability, sla
      )
      VALUES (
        pipeline.tenant_id, pipeline.pipeline_id, stage_order, stage_id, stage_name,
        stage_probability, stage_sla
      );
      stage_id := NULL;
    END LOOP;
  END LOOP;

  INSERT INTO deal_pipeline_stage_mapping (
    tenant_id, pipeline_id, old_stage_id, old_stage_name,
    target_stage_id, target_stage_name, outcome
  )
  SELECT
    source.tenant_id,
    source.pipeline_id,
    source.stage_id,
    source.stage_name,
    target.stage_id,
    target.stage_name,
    CASE
      WHEN source.is_closed_won THEN 'won'
      WHEN source.is_closed_lost THEN 'lost'
      ELSE NULL
    END
  FROM deal_pipeline_stage_sources AS source
  JOIN deal_pipeline_stage_targets AS target
    ON target.tenant_id = source.tenant_id
    AND target.pipeline_id = source.pipeline_id
    AND target.stage_order = CASE
      WHEN source.is_closed_won OR source.is_closed_lost THEN 9
      ELSE LEAST(GREATEST(source.stage_order, 1), 9)
    END;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{fromStageId}', TO_JSONB(mapping.target_stage_id), TRUE),
      updated_at = NOW()
  FROM deal_pipeline_stage_mapping AS mapping
  WHERE history.tenant_id = mapping.tenant_id
    AND history.resource = 'stage-history'
    AND history.data ->> 'fromStageId' = mapping.old_stage_id
    AND mapping.old_stage_id <> mapping.target_stage_id;

  UPDATE public.tenant_records AS history
  SET data = jsonb_set(history.data, '{toStageId}', TO_JSONB(mapping.target_stage_id), TRUE),
      updated_at = NOW()
  FROM deal_pipeline_stage_mapping AS mapping
  WHERE history.tenant_id = mapping.tenant_id
    AND history.resource = 'stage-history'
    AND history.data ->> 'toStageId' = mapping.old_stage_id
    AND mapping.old_stage_id <> mapping.target_stage_id;

  WITH deal_updates AS (
    SELECT
      deal.tenant_id,
      deal.record_id,
      COALESCE(mapping.target_stage_name, matching_target.stage_name, first_target.stage_name) AS target_stage_name,
      mapping.outcome
    FROM public.tenant_records AS deal
    JOIN public.tenant_records AS pipeline
      ON pipeline.tenant_id = deal.tenant_id
      AND pipeline.resource = 'pipelines'
      AND COALESCE(LOWER(pipeline.data ->> 'isActive'), 'false') = 'true'
      AND COALESCE(pipeline.data ->> 'id', pipeline.record_id) = deal.data ->> 'pipelineId'
    LEFT JOIN LATERAL (
      SELECT stage_mapping.target_stage_name, stage_mapping.outcome
      FROM deal_pipeline_stage_mapping AS stage_mapping
      WHERE stage_mapping.tenant_id = deal.tenant_id
        AND stage_mapping.pipeline_id = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
        AND stage_mapping.old_stage_name = deal.data ->> 'stage'
      ORDER BY stage_mapping.old_stage_id
      LIMIT 1
    ) AS mapping ON TRUE
    LEFT JOIN deal_pipeline_stage_targets AS matching_target
      ON matching_target.tenant_id = deal.tenant_id
      AND matching_target.pipeline_id = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
      AND matching_target.stage_name = deal.data ->> 'stage'
    LEFT JOIN deal_pipeline_stage_targets AS first_target
      ON first_target.tenant_id = deal.tenant_id
      AND first_target.pipeline_id = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
      AND first_target.stage_order = 1
    WHERE deal.resource = 'deals'
  )
  UPDATE public.tenant_records AS deal
  SET data = jsonb_set(
        deal.data,
        '{stage}',
        TO_JSONB(deal_updates.target_stage_name),
        TRUE
      ) || CASE
        WHEN NULLIF(deal.data ->> 'disposition', '') IS NOT NULL THEN '{}'::JSONB
        WHEN deal_updates.outcome IS NOT NULL THEN jsonb_build_object('disposition', deal_updates.outcome)
        ELSE '{}'::JSONB
      END,
      updated_at = NOW()
  FROM deal_updates
  WHERE deal.tenant_id = deal_updates.tenant_id
    AND deal.resource = 'deals'
    AND deal.record_id = deal_updates.record_id;

  DELETE FROM public.tenant_records AS stage
  USING public.tenant_records AS pipeline
  WHERE stage.tenant_id = pipeline.tenant_id
    AND stage.resource = 'pipeline-stages'
    AND pipeline.resource = 'pipelines'
    AND COALESCE(LOWER(pipeline.data ->> 'isActive'), 'false') = 'true'
    AND stage.data ->> 'pipelineId' = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
    AND NOT EXISTS (
      SELECT 1
      FROM deal_pipeline_stage_targets AS target
      WHERE target.tenant_id = stage.tenant_id
        AND target.pipeline_id = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
        AND target.stage_id = COALESCE(stage.data ->> 'id', stage.record_id)
    );
END $$;
