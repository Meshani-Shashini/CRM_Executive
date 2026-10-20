DO $$
DECLARE
  default_pipeline_id TEXT;
BEGIN
  SELECT COALESCE(data ->> 'id', record_id)
  INTO default_pipeline_id
  FROM public.tenant_records
  WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
    AND resource = 'pipelines'
    AND data ->> 'code' = 'COMMERCIAL'
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
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_records
    WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
      AND resource = 'pipeline-stages'
      AND data ->> 'pipelineId' = default_pipeline_id
  ) THEN
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000101',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000101',
          'pipelineId', default_pipeline_id,
          'name', 'Fact-Finding & Risk Survey',
          'stageOrder', 1,
          'winProbabilityPct', 20,
          'stagnationDaysThreshold', 30
        )
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000102',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000102',
          'pipelineId', default_pipeline_id,
          'name', 'Market Placement / Outender',
          'stageOrder', 2,
          'winProbabilityPct', 40,
          'stagnationDaysThreshold', 30
        )
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000103',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000103',
          'pipelineId', default_pipeline_id,
          'name', 'Quote Comparison & Presentation',
          'stageOrder', 3,
          'winProbabilityPct', 60,
          'stagnationDaysThreshold', 14
        )
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000104',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000104',
          'pipelineId', default_pipeline_id,
          'name', 'Underwriter Negotiation',
          'stageOrder', 4,
          'winProbabilityPct', 80,
          'stagnationDaysThreshold', 14
        )
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000105',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000105',
          'pipelineId', default_pipeline_id,
          'name', 'Policy Bound / won',
          'stageOrder', 5,
          'winProbabilityPct', 100,
          'stagnationDaysThreshold', 0
        )
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'pipeline-stages',
        '00000000-0000-4000-8000-000000000106',
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000106',
          'pipelineId', default_pipeline_id,
          'name', 'Lost / Declined',
          'stageOrder', 6,
          'winProbabilityPct', 0,
          'stagnationDaysThreshold', 0
        )
      );
  END IF;
END;
$$;
