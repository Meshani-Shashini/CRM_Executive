UPDATE public.tenant_records AS stage
SET data = stage.data || jsonb_build_object(
  'isClosedWon',
  upper(pipeline.data ->> 'code') = 'COMMERCIAL' AND stage.data ->> 'stageOrder' = '5'
    OR upper(pipeline.data ->> 'code') = 'SME_VELOCITY' AND stage.data ->> 'stageOrder' = '4'
    OR upper(pipeline.data ->> 'code') = 'RENEWALS' AND stage.data ->> 'stageOrder' = '5',
  'isClosedLost',
  upper(pipeline.data ->> 'code') = 'COMMERCIAL' AND stage.data ->> 'stageOrder' = '6'
    OR upper(pipeline.data ->> 'code') = 'SME_VELOCITY' AND stage.data ->> 'stageOrder' = '5'
    OR upper(pipeline.data ->> 'code') = 'RENEWALS' AND stage.data ->> 'stageOrder' = '6',
  'requiresApproval',
  upper(pipeline.data ->> 'code') = 'COMMERCIAL' AND stage.data ->> 'stageOrder' = '4'
),
updated_at = NOW()
FROM public.tenant_records AS pipeline
WHERE stage.tenant_id = pipeline.tenant_id
  AND stage.resource = 'pipeline-stages'
  AND pipeline.resource = 'pipelines'
  AND COALESCE(stage.data ->> 'pipelineId', '') = COALESCE(pipeline.data ->> 'id', pipeline.record_id)
  AND upper(pipeline.data ->> 'code') IN ('COMMERCIAL', 'SME_VELOCITY', 'RENEWALS')
  AND (
    upper(pipeline.data ->> 'code') = 'COMMERCIAL' AND stage.data ->> 'stageOrder' IN ('1', '2', '3', '4', '5', '6')
    OR upper(pipeline.data ->> 'code') = 'SME_VELOCITY' AND stage.data ->> 'stageOrder' IN ('1', '2', '3', '4', '5')
    OR upper(pipeline.data ->> 'code') = 'RENEWALS' AND stage.data ->> 'stageOrder' IN ('1', '2', '3', '4', '5', '6')
  );

WITH existing_links AS (
  SELECT DISTINCT ON (tenant_id, data ->> 'dealId')
    tenant_id,
    data ->> 'dealId' AS deal_id,
    COALESCE(data ->> 'id', record_id) AS lead_id
  FROM public.tenant_records
  WHERE resource = 'leads'
    AND NULLIF(data ->> 'dealId', '') IS NOT NULL
  ORDER BY tenant_id, data ->> 'dealId', record_id
)
UPDATE public.tenant_records AS deal
SET data = jsonb_set(deal.data, '{leadId}', to_jsonb(existing_links.lead_id), TRUE),
    updated_at = NOW()
FROM existing_links
WHERE deal.tenant_id = existing_links.tenant_id
  AND deal.resource = 'deals'
  AND deal.record_id = existing_links.deal_id
  AND NULLIF(deal.data ->> 'leadId', '') IS NULL;

WITH unlinked_deals AS (
  SELECT deal.*
  FROM public.tenant_records AS deal
  WHERE deal.resource = 'deals'
    AND NULLIF(deal.data ->> 'leadId', '') IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_records AS lead
      WHERE lead.tenant_id = deal.tenant_id
        AND lead.resource = 'leads'
        AND lead.data ->> 'dealId' = deal.record_id
    )
)
INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
SELECT
  deal.tenant_id,
  'leads',
  'lead-' || deal.record_id,
  jsonb_build_object(
    'id', 'lead-' || deal.record_id,
    'clientId', COALESCE(NULLIF(deal.data ->> 'clientId', ''), client.record_id),
    'client', COALESCE(NULLIF(deal.data ->> 'client', ''), client.data ->> 'name', 'Legacy deal'),
    'title', 'Legacy import',
    'value', COALESCE(deal.data -> 'value', '0'::JSONB),
    'sumInsured', COALESCE(deal.data -> 'value', '0'::JSONB),
    'premium', COALESCE(client.data -> 'premium', '0'::JSONB),
    'currency', COALESCE(NULLIF(deal.data ->> 'currency', ''), 'MVR'),
    'pipelineId', deal.data ->> 'pipelineId',
    'funnelStage', 'Converted to deal',
    'disposition', 'converted',
    'source', 'Legacy import',
    'notes', COALESCE(deal.data ->> 'notes', ''),
    'productCode', COALESCE(NULLIF(deal.data ->> 'productCode', ''), NULLIF(deal.data ->> 'product', ''), 'LEGACY'),
    'insuranceClass', COALESCE(NULLIF(client.data ->> 'class', ''), NULLIF(deal.data ->> 'product', ''), 'General'),
    'country', COALESCE(client.data ->> 'country', ''),
    'contact', COALESCE(NULLIF(deal.data ->> 'contactName', ''), client.data ->> 'contactPerson', ''),
    'contactEmail', deal.data -> 'contactEmail',
    'contactPhone', deal.data -> 'contactPhone',
    'whatsapp', deal.data -> 'whatsapp',
    'telegram', deal.data -> 'telegram',
    'temperature', 'WARM',
    'status', 'IN-PROGRESS',
    'ownerId', COALESCE(NULLIF(deal.data ->> 'ownerId', ''), 'system-migration'),
    'renewalDate', COALESCE(
      NULLIF(deal.data ->> 'policyExpiry', ''),
      NULLIF(deal.data ->> 'renewalExpiry', ''),
      NULLIF(deal.data ->> 'closeDate', ''),
      CURRENT_DATE::TEXT
    ),
    'closeDate', deal.data ->> 'closeDate',
    'lastActivity', 'Legacy import',
    'dealId', deal.record_id,
    'stageHistory', jsonb_build_array(jsonb_build_object(
      'fromStage', 'Lead Identified',
      'toStage', 'Converted to deal',
      'enteredAt', COALESCE(NULLIF(deal.data ->> 'createdAt', ''), NOW()::TEXT),
      'durationDays', 0
    )),
    'createdAt', COALESCE(NULLIF(deal.data ->> 'createdAt', ''), NOW()::TEXT),
    'updatedAt', NOW()::TEXT,
    'routedAt', COALESCE(NULLIF(deal.data ->> 'createdAt', ''), NOW()::TEXT)
  ),
  NOW()
FROM unlinked_deals AS deal
LEFT JOIN LATERAL (
  SELECT candidate.record_id, candidate.data
  FROM public.tenant_records AS candidate
  WHERE candidate.tenant_id = deal.tenant_id
    AND candidate.resource = 'clients'
    AND (
      candidate.record_id = deal.data ->> 'clientId'
      OR candidate.data ->> 'name' = deal.data ->> 'client'
    )
  ORDER BY CASE WHEN candidate.record_id = deal.data ->> 'clientId' THEN 0 ELSE 1 END
  LIMIT 1
) AS client ON TRUE
ON CONFLICT (tenant_id, resource, record_id) DO NOTHING;

UPDATE public.tenant_records AS deal
SET data = jsonb_set(deal.data, '{leadId}', to_jsonb('lead-' || deal.record_id), TRUE),
    updated_at = NOW()
WHERE deal.resource = 'deals'
  AND NULLIF(deal.data ->> 'leadId', '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.tenant_records AS lead
    WHERE lead.tenant_id = deal.tenant_id
      AND lead.resource = 'leads'
      AND lead.record_id = 'lead-' || deal.record_id
      AND lead.data ->> 'dealId' = deal.record_id
  );
