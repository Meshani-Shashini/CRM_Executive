BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.sync_tenant_records(text,jsonb,boolean)') IS NOT NULL
    AND to_regprocedure('public.sync_tenant_records_strict_duration_v1(text,jsonb,boolean)') IS NULL THEN
    ALTER FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN)
      RENAME TO sync_tenant_records_strict_duration_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_tenant_records(
  p_resource TEXT,
  p_records JSONB,
  p_delete_missing BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_records JSONB := p_records;
  item JSONB;
  entered_at TIMESTAMPTZ;
  exited_at TIMESTAMPTZ;
  expected_duration NUMERIC;
  supplied_duration NUMERIC;
BEGIN
  IF p_resource = 'lead-stage-history' AND jsonb_typeof(p_records) = 'array' THEN
    normalized_records := '[]'::JSONB;
    FOR item IN SELECT record_data FROM jsonb_array_elements(p_records) AS records(record_data)
    LOOP
      IF jsonb_typeof(item) = 'object'
        AND jsonb_typeof(item -> 'entered_at') = 'string'
        AND jsonb_typeof(item -> 'exited_at') = 'string'
        AND jsonb_typeof(item -> 'duration_days') = 'number' THEN
        entered_at := (item ->> 'entered_at')::TIMESTAMPTZ;
        exited_at := (item ->> 'exited_at')::TIMESTAMPTZ;
        supplied_duration := (item ->> 'duration_days')::NUMERIC;

        IF exited_at >= entered_at THEN
          expected_duration := EXTRACT(EPOCH FROM (exited_at - entered_at)) / 86400;
          IF abs(supplied_duration - expected_duration) <= 0.0000115740740741 THEN
            item := jsonb_set(item, '{duration_days}', to_jsonb(expected_duration));
          END IF;
        END IF;
      END IF;

      normalized_records := normalized_records || jsonb_build_array(item);
    END LOOP;
  END IF;

  RETURN public.sync_tenant_records_strict_duration_v1(
    p_resource,
    normalized_records,
    p_delete_missing
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tenant_records_strict_duration_v1(TEXT, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) TO authenticated;

COMMIT;
