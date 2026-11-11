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
  IF p_kind IS NULL OR p_kind NOT IN ('deal', 'quotation-request', 'invoice')
    OR p_year IS NULL OR p_year < 2000 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Choose a valid reference type and year.'
      USING ERRCODE = '22023';
  END IF;

  prefix := CASE p_kind
    WHEN 'deal' THEN 'DL'
    WHEN 'quotation-request' THEN 'QRS'
    WHEN 'invoice' THEN 'INV'
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

CREATE OR REPLACE FUNCTION public.normalize_tenant_record_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reference_year INT;
  reference_value TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NULLIF(NEW.data ->> '__expectedUpdatedAt', '') IS NOT NULL
    AND NEW.data ->> '__expectedUpdatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
    RAISE EXCEPTION 'Record modified by another user. Please reload.'
      USING ERRCODE = '40001';
  END IF;

  NEW.data := NEW.data - '__expectedUpdatedAt';

  IF NEW.resource NOT IN ('deals', 'quotation-requests', 'invoices') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    reference_year := COALESCE(
      NULLIF(substring(NEW.data ->> 'createdAt' FROM '^([0-9]{4})'), '')::INT,
      EXTRACT(YEAR FROM OLD.updated_at)::INT
    );
  ELSE
    reference_year := COALESCE(
      NULLIF(substring(NEW.data ->> 'createdAt' FROM '^([0-9]{4})'), '')::INT,
      NULLIF(substring(NEW.data ->> 'issueDate' FROM '^([0-9]{4})'), '')::INT,
      EXTRACT(YEAR FROM CURRENT_DATE)::INT
    );
  END IF;

  IF NEW.resource = 'deals' THEN
    reference_value := COALESCE(
      NULLIF(btrim(NEW.data ->> 'reference'), ''),
      CASE WHEN TG_OP = 'UPDATE' THEN NULLIF(btrim(OLD.data ->> 'reference'), '') END
    );
    IF reference_value IS NULL THEN
      reference_value := public.allocate_tenant_reference(NEW.tenant_id, 'deal', reference_year);
    END IF;
    NEW.data := jsonb_set(NEW.data, '{reference}', to_jsonb(reference_value), TRUE);
  ELSIF NEW.resource = 'quotation-requests' THEN
    reference_value := COALESCE(
      NULLIF(btrim(NEW.data ->> 'reference'), ''),
      NULLIF(btrim(NEW.data ->> 'ref'), ''),
      CASE WHEN TG_OP = 'UPDATE' THEN
        COALESCE(NULLIF(btrim(OLD.data ->> 'reference'), ''), NULLIF(btrim(OLD.data ->> 'ref'), ''))
      END
    );
    IF reference_value IS NULL THEN
      reference_value := public.allocate_tenant_reference(NEW.tenant_id, 'quotation-request', reference_year);
    END IF;
    NEW.data := jsonb_set(NEW.data - 'ref', '{reference}', to_jsonb(reference_value), TRUE);
  ELSE
    reference_value := COALESCE(
      NULLIF(btrim(NEW.data ->> 'invoiceNumber'), ''),
      NULLIF(btrim(NEW.data ->> 'number'), ''),
      CASE WHEN TG_OP = 'UPDATE' THEN
        COALESCE(NULLIF(btrim(OLD.data ->> 'invoiceNumber'), ''), NULLIF(btrim(OLD.data ->> 'number'), ''))
      END
    );
    IF reference_value IS NULL THEN
      reference_value := public.allocate_tenant_reference(NEW.tenant_id, 'invoice', reference_year);
    END IF;
    NEW.data := NEW.data || jsonb_build_object('invoiceNumber', reference_value, 'number', reference_value);
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_tenant_record_reference() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_quotation_request_line_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  batch_reference TEXT;
  line_reference TEXT;
  line_record RECORD;
  old_line RECORD;
  existing_line JSONB;
  line_vendor_id TEXT;
  seen_line_references TEXT[] := ARRAY[]::TEXT[];
  request_lines JSONB;
BEGIN
  IF NEW.resource <> 'quotation-requests' THEN
    RETURN NEW;
  END IF;

  batch_reference := NULLIF(btrim(NEW.data ->> 'reference'), '');
  request_lines := CASE
    WHEN jsonb_typeof(NEW.data -> 'lines') = 'array' THEN NEW.data -> 'lines'
    ELSE '[]'::JSONB
  END;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.data -> 'lines') = 'array' THEN
    FOR old_line IN SELECT value FROM jsonb_array_elements(OLD.data -> 'lines') AS item(value)
    LOOP
      SELECT value INTO existing_line
      FROM jsonb_array_elements(request_lines) AS item(value)
      WHERE value ->> 'id' = old_line.value ->> 'id';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation Request lines cannot be deleted; cancel the line instead.'
          USING ERRCODE = '23514';
      END IF;
      IF existing_line ->> 'reference' IS DISTINCT FROM old_line.value ->> 'reference' THEN
        RAISE EXCEPTION 'Quotation Request line references are immutable.'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  FOR line_record IN SELECT value FROM jsonb_array_elements(request_lines) AS item(value)
  LOOP
    line_reference := NULLIF(btrim(line_record.value ->> 'reference'), '');
    IF line_reference IS NULL THEN
      RAISE EXCEPTION 'Every Quotation Request line must have a reference.'
        USING ERRCODE = '23514';
    END IF;

    IF line_reference = batch_reference OR line_reference = ANY(seen_line_references) THEN
      RAISE EXCEPTION 'Quotation Request batch and line references must be unique.'
        USING ERRCODE = '23505';
    END IF;

    line_vendor_id := NULLIF(btrim(line_record.value ->> 'vendorId'), '');
    IF line_vendor_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.tenant_records AS vendor
      WHERE vendor.tenant_id = NEW.tenant_id
        AND vendor.resource = 'vendors'
        AND vendor.record_id = line_vendor_id
        AND vendor.data ->> 'vendorType' IN ('Insurer', 'Reinsurer')
    ) THEN
      RAISE EXCEPTION 'Every Quotation Request line must reference an insurer or reinsurer in this tenant.'
        USING ERRCODE = '23503';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tenant_records AS existing
      WHERE existing.tenant_id = NEW.tenant_id
        AND existing.resource = 'quotation-requests'
        AND existing.record_id <> NEW.record_id
        AND (
          existing.data ->> 'reference' = line_reference
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(existing.data -> 'lines') = 'array'
                THEN existing.data -> 'lines' ELSE '[]'::JSONB END
            ) AS existing_line(value)
            WHERE existing_line.value ->> 'reference' = line_reference
          )
        )
    ) THEN
      RAISE EXCEPTION 'Quotation Request line reference already exists in this tenant.'
        USING ERRCODE = '23505';
    END IF;

    seen_line_references := array_append(seen_line_references, line_reference);
  END LOOP;

  IF batch_reference IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tenant_records AS existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.resource = 'quotation-requests'
      AND existing.record_id <> NEW.record_id
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(existing.data -> 'lines') = 'array'
            THEN existing.data -> 'lines' ELSE '[]'::JSONB END
        ) AS existing_line(value)
        WHERE existing_line.value ->> 'reference' = batch_reference
      )
  ) THEN
    RAISE EXCEPTION 'Quotation Request batch reference already exists as a line in this tenant.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_quotation_request_line_references() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_validate_qrs_line_references ON public.tenant_records;
CREATE TRIGGER tenant_records_validate_qrs_line_references
  BEFORE INSERT OR UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_quotation_request_line_references();

CREATE OR REPLACE FUNCTION public.prevent_vendor_delete_with_qrs_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.resource = 'vendors' AND EXISTS (
    SELECT 1
    FROM public.tenant_records AS request
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(request.data -> 'lines') = 'array'
        THEN request.data -> 'lines' ELSE '[]'::JSONB END
    ) AS line(value)
    WHERE request.tenant_id = OLD.tenant_id
      AND request.resource = 'quotation-requests'
      AND line.value ->> 'vendorId' = OLD.record_id
  ) THEN
    RAISE EXCEPTION 'This Vendor cannot be deleted while it is linked to a quotation request line.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_vendor_delete_with_qrs_lines() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_prevent_vendor_qrs_line_delete ON public.tenant_records;
CREATE TRIGGER tenant_records_prevent_vendor_qrs_line_delete
  BEFORE DELETE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_vendor_delete_with_qrs_lines();

COMMIT;
