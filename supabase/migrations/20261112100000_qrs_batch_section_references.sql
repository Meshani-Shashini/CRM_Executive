BEGIN;

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
    SELECT COALESCE(max(
      CASE
        WHEN matches.parts[1] IS NOT NULL THEN matches.parts[1]::INT
        ELSE matches.parts[4]::INT
      END
    ), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(
      record.data ->> 'reference',
      '^(?:QRS-([0-9]+)-([0-9]{4})|(?:QR|QRS)-([0-9]{4})-([0-9]+))$'
    ) AS matches(parts)
    WHERE record.tenant_id = p_tenant_id
      AND record.resource = 'quotation-requests'
      AND (matches.parts[2] = p_year::TEXT OR matches.parts[3] = p_year::TEXT);
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

  IF p_kind = 'quotation-request' THEN
    RETURN 'QRS-' || lpad(next_value::TEXT, 3, '0') || '-' || p_year::TEXT;
  END IF;
  RETURN prefix || '-' || p_year::TEXT || '-' || lpad(next_value::TEXT, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_tenant_reference(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_validate_qrs_line_references ON public.tenant_records;

DO $$
DECLARE
  request_row RECORD;
  old_reference TEXT;
  new_reference TEXT;
  reference_parts TEXT[];
  new_lines JSONB;
BEGIN
  FOR request_row IN
    SELECT tenant_id, record_id, data
    FROM public.tenant_records
    WHERE resource = 'quotation-requests'
  LOOP
    old_reference := COALESCE(NULLIF(request_row.data ->> 'reference', ''), request_row.data ->> 'ref');
    reference_parts := regexp_match(old_reference, '^(?:QR|QRS)-([0-9]{4})-([0-9]+)$');
    IF reference_parts IS NOT NULL THEN
      new_reference := 'QRS-' || lpad(reference_parts[2]::INT::TEXT, 3, '0') || '-' || reference_parts[1];
    ELSE
      new_reference := old_reference;
    END IF;

    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN regexp_match(line.value ->> 'reference', '^(?:QR|QRS)-[0-9]{4}-[0-9]+-([0-9]+)$') IS NOT NULL THEN
          jsonb_set(
            line.value,
            '{reference}',
            to_jsonb(new_reference || '-01-' || lpad(
              (regexp_match(line.value ->> 'reference', '-([0-9]+)$'))[1],
              2,
              '0'
            )),
            TRUE
          )
        ELSE line.value
      END
      ORDER BY line.ordinality
    ), '[]'::JSONB)
    INTO new_lines
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(request_row.data -> 'lines') = 'array'
        THEN request_row.data -> 'lines' ELSE '[]'::JSONB END
    ) WITH ORDINALITY AS line(value, ordinality);

    UPDATE public.tenant_records
    SET data = (request_row.data - 'ref')
      || jsonb_build_object('reference', new_reference, 'lines', new_lines)
    WHERE tenant_id = request_row.tenant_id
      AND record_id = request_row.record_id
      AND resource = 'quotation-requests';
  END LOOP;
END;
$$;

INSERT INTO public.tenant_sequences (tenant_id, kind, year, current_val)
SELECT tenant_id, 'quotation-request', parts.year::INT, max(parts.sequence::INT)
FROM public.tenant_records AS record
CROSS JOIN LATERAL (
  SELECT (matches.parts)[1] AS sequence, (matches.parts)[2] AS year
  FROM regexp_match(record.data ->> 'reference', '^QRS-([0-9]+)-([0-9]{4})$') AS matches(parts)
  UNION ALL
  SELECT (matches.parts)[2] AS sequence, (matches.parts)[1] AS year
  FROM regexp_match(record.data ->> 'reference', '^(?:QR|QRS)-([0-9]{4})-([0-9]+)$') AS matches(parts)
) AS parts
WHERE record.resource = 'quotation-requests'
GROUP BY tenant_id, parts.year
ON CONFLICT (tenant_id, kind, year)
DO UPDATE SET current_val = GREATEST(public.tenant_sequences.current_val, EXCLUDED.current_val);

CREATE TRIGGER tenant_records_validate_qrs_line_references
  BEFORE INSERT OR UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_request_line_references();

COMMIT;
