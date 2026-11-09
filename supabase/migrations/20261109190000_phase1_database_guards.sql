BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_sequences (
  tenant_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deal', 'quotation-request', 'invoice')),
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  current_val INT NOT NULL CHECK (current_val >= 0),
  PRIMARY KEY (tenant_id, kind, year)
);

ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_sequences FROM PUBLIC, anon, authenticated;

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
    WHEN 'quotation-request' THEN 'QR'
    WHEN 'invoice' THEN 'INV'
  END;

  IF p_kind = 'deal' THEN
    SELECT COALESCE(max((matches.parts)[1]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'reference', '^DL-' || p_year::TEXT || '-([0-9]+)$') AS matches(parts)
    WHERE record.tenant_id = p_tenant_id AND record.resource = 'deals';
  ELSIF p_kind = 'quotation-request' THEN
    SELECT COALESCE(max((matches.parts)[1]::INT), 0)
    INTO highest_existing
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL regexp_match(record.data ->> 'reference', '^QR-' || p_year::TEXT || '-([0-9]+)$') AS matches(parts)
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

CREATE OR REPLACE FUNCTION public.get_next_reference(
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
  profile public.user_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = (SELECT auth.uid());

  IF NOT FOUND
    OR profile.tenant_id IS DISTINCT FROM p_tenant_id
    OR profile.role NOT IN ('System Admin', 'Sales', 'Accountant') THEN
    RAISE EXCEPTION 'You are not allowed to create references for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.allocate_tenant_reference(p_tenant_id, p_kind, p_year);
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_reference(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_reference(UUID, TEXT, INT) TO authenticated;

DO $$
DECLARE
  record_row RECORD;
  reference_year INT;
  reference_value TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tenant_records AS deal
    WHERE deal.resource = 'deals'
      AND (
        NULLIF(btrim(deal.data ->> 'leadId'), '') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.tenant_records AS lead
          WHERE lead.tenant_id = deal.tenant_id
            AND lead.resource = 'leads'
            AND lead.record_id = deal.data ->> 'leadId'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Phase 1 guards require every existing Deal to reference a Lead in the same tenant. Link or remove invalid Deals before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_records AS record
    CROSS JOIN LATERAL (VALUES
      ('leads', record.data ->> 'leadId'),
      ('deals', record.data ->> 'dealId'),
      ('clients', record.data ->> 'clientId'),
      ('invoices', record.data ->> 'invoiceId')
    ) AS linked_record(resource, referenced_id)
    WHERE NULLIF(btrim(linked_record.referenced_id), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_records AS referenced
        WHERE referenced.tenant_id = record.tenant_id
          AND referenced.resource = linked_record.resource
          AND referenced.record_id = linked_record.referenced_id
      )
  ) THEN
    RAISE EXCEPTION 'Phase 1 guards found a Lead, Deal, Client, or Invoice link with no matching record in the same tenant. Repair invalid links before applying this migration.';
  END IF;

  FOR record_row IN
    SELECT deal.tenant_id, deal.record_id, deal.data, deal.updated_at
    FROM public.tenant_records AS deal
    WHERE deal.resource = 'deals'
      AND NULLIF(btrim(deal.data ->> 'reference'), '') IS NULL
    ORDER BY deal.tenant_id, deal.updated_at, deal.record_id
  LOOP
    reference_year := COALESCE(
      NULLIF(substring(record_row.data ->> 'createdAt' FROM '^([0-9]{4})'), '')::INT,
      EXTRACT(YEAR FROM record_row.updated_at)::INT
    );
    reference_value := public.allocate_tenant_reference(record_row.tenant_id, 'deal', reference_year);
    UPDATE public.tenant_records
    SET data = jsonb_set(data, '{reference}', to_jsonb(reference_value), TRUE)
    WHERE tenant_id = record_row.tenant_id
      AND resource = 'deals'
      AND record_id = record_row.record_id;
  END LOOP;

  UPDATE public.tenant_records
  SET data = data || jsonb_build_object(
    'reference', COALESCE(NULLIF(btrim(data ->> 'reference'), ''), NULLIF(btrim(data ->> 'ref'), '')),
    'ref', COALESCE(NULLIF(btrim(data ->> 'ref'), ''), NULLIF(btrim(data ->> 'reference'), ''))
  )
  WHERE resource = 'quotation-requests'
    AND (
      NULLIF(btrim(data ->> 'reference'), '') IS NULL
      OR NULLIF(btrim(data ->> 'ref'), '') IS NULL
    )
    AND (
      NULLIF(btrim(data ->> 'reference'), '') IS NOT NULL
      OR NULLIF(btrim(data ->> 'ref'), '') IS NOT NULL
    );

  FOR record_row IN
    SELECT request.tenant_id, request.record_id, request.data, request.updated_at
    FROM public.tenant_records AS request
    WHERE request.resource = 'quotation-requests'
      AND NULLIF(btrim(request.data ->> 'reference'), '') IS NULL
    ORDER BY request.tenant_id, request.updated_at, request.record_id
  LOOP
    reference_year := COALESCE(
      NULLIF(substring(record_row.data ->> 'createdAt' FROM '^([0-9]{4})'), '')::INT,
      EXTRACT(YEAR FROM record_row.updated_at)::INT
    );
    reference_value := public.allocate_tenant_reference(record_row.tenant_id, 'quotation-request', reference_year);
    UPDATE public.tenant_records
    SET data = data || jsonb_build_object('reference', reference_value, 'ref', reference_value)
    WHERE tenant_id = record_row.tenant_id
      AND resource = 'quotation-requests'
      AND record_id = record_row.record_id;
  END LOOP;

  UPDATE public.tenant_records
  SET data = data || jsonb_build_object(
    'invoiceNumber', COALESCE(NULLIF(btrim(data ->> 'invoiceNumber'), ''), NULLIF(btrim(data ->> 'number'), '')),
    'number', COALESCE(NULLIF(btrim(data ->> 'number'), ''), NULLIF(btrim(data ->> 'invoiceNumber'), ''))
  )
  WHERE resource = 'invoices'
    AND (
      NULLIF(btrim(data ->> 'invoiceNumber'), '') IS NULL
      OR NULLIF(btrim(data ->> 'number'), '') IS NULL
    )
    AND (
      NULLIF(btrim(data ->> 'invoiceNumber'), '') IS NOT NULL
      OR NULLIF(btrim(data ->> 'number'), '') IS NOT NULL
    );

  FOR record_row IN
    SELECT invoice.tenant_id, invoice.record_id, invoice.data, invoice.updated_at
    FROM public.tenant_records AS invoice
    WHERE invoice.resource = 'invoices'
      AND NULLIF(btrim(invoice.data ->> 'invoiceNumber'), '') IS NULL
    ORDER BY invoice.tenant_id, invoice.updated_at, invoice.record_id
  LOOP
    reference_year := COALESCE(
      NULLIF(substring(record_row.data ->> 'issueDate' FROM '^([0-9]{4})'), '')::INT,
      EXTRACT(YEAR FROM record_row.updated_at)::INT
    );
    reference_value := public.allocate_tenant_reference(record_row.tenant_id, 'invoice', reference_year);
    UPDATE public.tenant_records
    SET data = data || jsonb_build_object('invoiceNumber', reference_value, 'number', reference_value)
    WHERE tenant_id = record_row.tenant_id
      AND resource = 'invoices'
      AND record_id = record_row.record_id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE resource = 'deals'
    GROUP BY tenant_id, data ->> 'reference'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Deal references exist within a tenant. Resolve duplicates before applying Phase 1 guards.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE resource = 'quotation-requests'
    GROUP BY tenant_id, data ->> 'reference'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Quotation Request references exist within a tenant. Resolve duplicates before applying Phase 1 guards.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE resource = 'invoices'
    GROUP BY tenant_id, data ->> 'invoiceNumber'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Invoice numbers exist within a tenant. Resolve duplicates before applying Phase 1 guards.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_records_deals_reference_uidx
  ON public.tenant_records (tenant_id, (data ->> 'reference'))
  WHERE resource = 'deals' AND NULLIF(data ->> 'reference', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_records_quotation_requests_reference_uidx
  ON public.tenant_records (tenant_id, (data ->> 'reference'))
  WHERE resource = 'quotation-requests' AND NULLIF(data ->> 'reference', '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_records_invoices_number_uidx
  ON public.tenant_records (tenant_id, (data ->> 'invoiceNumber'))
  WHERE resource = 'invoices' AND NULLIF(data ->> 'invoiceNumber', '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_records_lead_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'leadId'))
  WHERE data ? 'leadId';
CREATE INDEX IF NOT EXISTS tenant_records_deal_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'dealId'))
  WHERE data ? 'dealId';
CREATE INDEX IF NOT EXISTS tenant_records_client_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'clientId'))
  WHERE data ? 'clientId';
CREATE INDEX IF NOT EXISTS tenant_records_vendor_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'vendorId'))
  WHERE data ? 'vendorId';
CREATE INDEX IF NOT EXISTS tenant_records_stage_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'stageId'))
  WHERE data ? 'stageId';
CREATE INDEX IF NOT EXISTS tenant_records_pipeline_id_idx
  ON public.tenant_records (tenant_id, (data ->> 'pipelineId'))
  WHERE data ? 'pipelineId';

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
    NEW.data := NEW.data || jsonb_build_object('reference', reference_value, 'ref', reference_value);
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

CREATE OR REPLACE FUNCTION public.validate_tenant_record_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  link_row RECORD;
BEGIN
  IF NEW.resource = 'deals' AND NULLIF(btrim(NEW.data ->> 'leadId'), '') IS NULL THEN
    RAISE EXCEPTION 'A Deal must be linked to a Lead before it can be saved.'
      USING ERRCODE = '23514';
  END IF;

  FOR link_row IN
    SELECT * FROM (VALUES
      ('leads', NEW.data ->> 'leadId'),
      ('deals', NEW.data ->> 'dealId'),
      ('clients', NEW.data ->> 'clientId'),
      ('invoices', NEW.data ->> 'invoiceId')
    ) AS linked_record(resource, referenced_id)
  LOOP
    IF NULLIF(btrim(link_row.referenced_id), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_records AS referenced
        WHERE referenced.tenant_id = NEW.tenant_id
          AND referenced.resource = link_row.resource
          AND referenced.record_id = link_row.referenced_id
      ) THEN
      RAISE EXCEPTION 'The linked % record was not found in this tenant. Reload and verify the link before saving.', link_row.resource
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' AND NULLIF(NEW.data ->> '__expectedUpdatedAt', '') IS NOT NULL
    AND (NEW.data ->> '__expectedUpdatedAt')::TIMESTAMPTZ IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Record modified by another user. Please reload.'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_tenant_record_references() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_tenant_record_delete_with_dependents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.resource = 'leads' AND (
    EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'deals' AND data ->> 'leadId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'quotation-requests' AND data ->> 'leadId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'activities' AND data ->> 'leadId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'lead-stage-history' AND data ->> 'lead_id' = OLD.record_id)
  ) THEN
    RAISE EXCEPTION 'This Lead cannot be deleted while it is linked to a Deal, quotation request, activity, or stage history.'
      USING ERRCODE = '23503';
  END IF;

  IF OLD.resource = 'deals' AND (
    EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'quotation-requests' AND data ->> 'dealId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'leads' AND data ->> 'dealId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'invoices' AND (data ->> 'linkedDealId' = OLD.record_id OR data ->> 'dealId' = OLD.record_id))
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'activities' AND data ->> 'dealId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'stage-history' AND data ->> 'dealId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'deals' AND data ->> 'renewalForDealId' = OLD.record_id)
  ) THEN
    RAISE EXCEPTION 'This Deal cannot be deleted while it has linked quotation requests, invoices, activities, stage history, or renewals.'
      USING ERRCODE = '23503';
  END IF;

  IF OLD.resource = 'clients' AND (
    EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'leads' AND data ->> 'clientId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'deals' AND data ->> 'clientId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'invoices' AND data ->> 'clientId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'quotation-requests' AND data ->> 'clientId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'activities' AND data ->> 'clientId' = OLD.record_id)
    OR EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'payments' AND data ->> 'clientId' = OLD.record_id)
  ) THEN
    RAISE EXCEPTION 'This Client cannot be deleted while it is linked to Deals, invoices, payments, quotation requests, or activities.'
      USING ERRCODE = '23503';
  END IF;

  IF OLD.resource = 'vendors' AND (
    EXISTS (SELECT 1 FROM public.tenant_records WHERE tenant_id = OLD.tenant_id AND resource = 'deals' AND data ->> 'vendorId' = OLD.record_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_records AS request
      WHERE request.tenant_id = OLD.tenant_id
        AND request.resource = 'quotation-requests'
        AND jsonb_typeof(request.data -> 'vendorIds') = 'array'
        AND request.data -> 'vendorIds' ? OLD.record_id
    )
  ) THEN
    RAISE EXCEPTION 'This Vendor cannot be deleted while it is linked to Deals or quotation requests.'
      USING ERRCODE = '23503';
  END IF;

  IF OLD.resource = 'invoices' AND EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE tenant_id = OLD.tenant_id
      AND resource = 'payments'
      AND data ->> 'invoiceId' = OLD.record_id
  ) THEN
    RAISE EXCEPTION 'This Invoice cannot be deleted while it has linked Payments.'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_tenant_record_delete_with_dependents() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_tenant_record_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.resource IN ('activities', 'audit-log')
    OR NEW.resource IN ('activities', 'audit-log')
  ) THEN
    RAISE EXCEPTION 'Activity and audit records are immutable. Add a new record instead.'
      USING ERRCODE = '55000';
  ELSIF TG_OP = 'DELETE' AND OLD.resource IN ('activities', 'audit-log') THEN
    RAISE EXCEPTION 'Activity and audit records are immutable. Add a new record instead.'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_tenant_record_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_records_normalize_reference ON public.tenant_records;
CREATE TRIGGER tenant_records_normalize_reference
  BEFORE INSERT OR UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.normalize_tenant_record_reference();

DROP TRIGGER IF EXISTS tenant_records_validate_references ON public.tenant_records;
CREATE TRIGGER tenant_records_validate_references
  BEFORE INSERT OR UPDATE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_record_references();

DROP TRIGGER IF EXISTS tenant_records_guard_dependents ON public.tenant_records;
CREATE TRIGGER tenant_records_guard_dependents
  BEFORE DELETE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_record_delete_with_dependents();

DROP TRIGGER IF EXISTS tenant_records_immutable_records ON public.tenant_records;
CREATE TRIGGER tenant_records_immutable_records
  BEFORE UPDATE OR DELETE ON public.tenant_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_record_mutation();

CREATE OR REPLACE FUNCTION public.can_read_tenant_record(
  p_resource TEXT,
  p_data JSONB,
  p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile
  FROM public.user_profiles
  WHERE id = (SELECT auth.uid()) AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF profile.role IN ('System Admin', 'Sales', 'Accountant') THEN
    RETURN TRUE;
  END IF;
  IF profile.role <> 'Client' OR profile.client_record_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_resource = 'clients' THEN
    RETURN p_data ->> 'id' = profile.client_record_id;
  ELSIF p_resource IN ('deals', 'invoices', 'payments') THEN
    IF p_data ->> 'clientId' = profile.client_record_id THEN
      RETURN TRUE;
    END IF;

    IF p_resource = 'payments' THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.tenant_records AS invoice
        WHERE invoice.tenant_id = p_tenant_id
          AND invoice.resource = 'invoices'
          AND invoice.record_id = p_data ->> 'invoiceId'
          AND invoice.data ->> 'clientId' = profile.client_record_id
      );
    END IF;
    RETURN FALSE;
  ELSIF p_resource = 'activities' THEN
    RETURN p_data ->> 'clientId' = profile.client_record_id;
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_tenant_record(TEXT, JSONB, UUID) TO authenticated;

DROP POLICY IF EXISTS "Tenant members can read permitted records" ON public.tenant_records;
CREATE POLICY "Tenant members can read permitted records"
  ON public.tenant_records FOR SELECT TO authenticated
  USING (public.can_read_tenant_record(resource, data, tenant_id));

REVOKE INSERT, UPDATE, DELETE ON public.tenant_records FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.sync_tenant_records(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.sync_tenant_records(
  p_resource TEXT,
  p_records JSONB,
  p_delete_missing BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  item JSONB;
  existing_record public.tenant_records%ROWTYPE;
  entered_at TIMESTAMPTZ;
  exited_at TIMESTAMPTZ;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'customer-lookups', 'activities', 'audit-log', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'lead-stage-history', 'company', 'email-templates', 'products', 'policy-types',
    'vendors', 'quotation-requests'
  ];
  allowed BOOLEAN;
BEGIN
  SELECT * INTO profile FROM public.user_profiles
  WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
  END IF;
  IF p_resource IS NULL OR p_resource <> ALL(allowed_resources)
    OR jsonb_typeof(p_records) IS DISTINCT FROM 'array'
    OR p_delete_missing IS NULL THEN
    RAISE EXCEPTION 'Invalid record collection' USING ERRCODE = '22023';
  END IF;

  allowed := CASE profile.role
    WHEN 'System Admin' THEN TRUE
    WHEN 'Sales' THEN p_resource = ANY(ARRAY[
      'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'vendors',
      'quotation-requests', 'stage-history', 'lead-stage-history'
    ])
    WHEN 'Accountant' THEN p_resource = ANY(ARRAY['invoices', 'payments'])
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Role is not allowed to update this collection' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(record_data)
    WHERE jsonb_typeof(records.record_data) <> 'object'
      OR jsonb_typeof(records.record_data -> 'id') <> 'string'
      OR COALESCE(length(records.record_data ->> 'id'), 0) = 0
  ) THEN
    RAISE EXCEPTION 'Every record must have a non-empty string id' USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'lead-stage-history' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(stage_record)
    WHERE jsonb_typeof(records.stage_record -> 'lead_id') IS DISTINCT FROM 'string'
      OR COALESCE(length(records.stage_record ->> 'lead_id'), 0) = 0
      OR jsonb_typeof(records.stage_record -> 'stage') IS DISTINCT FROM 'string'
      OR (records.stage_record ->> 'stage') <> ALL(ARRAY[
        'Lead Identified', 'Contact Made', 'Key Person Identified',
        'Intro Email Sent', 'Meetings Ongoing', 'Converted to deal', 'Lost'
      ])
      OR jsonb_typeof(records.stage_record -> 'entered_at') IS DISTINCT FROM 'string'
      OR jsonb_typeof(records.stage_record -> 'is_current') IS DISTINCT FROM 'boolean'
      OR (records.stage_record ? 'duration_days' AND jsonb_typeof(records.stage_record -> 'duration_days') IS DISTINCT FROM 'number')
      OR (records.stage_record ? 'exited_at' AND jsonb_typeof(records.stage_record -> 'exited_at') IS DISTINCT FROM 'string')
      OR (records.stage_record ? 'duration_days' AND NOT (records.stage_record ? 'exited_at'))
      OR (records.stage_record ? 'exited_at' AND NOT (records.stage_record ? 'duration_days'))
  ) THEN
    RAISE EXCEPTION 'Invalid lead stage history record' USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'lead-stage-history' THEN
    FOR item IN
      SELECT records.record_data
      FROM jsonb_array_elements(p_records) AS records(record_data)
    LOOP
      entered_at := (item ->> 'entered_at')::TIMESTAMPTZ;
      IF item ? 'exited_at' THEN
        exited_at := (item ->> 'exited_at')::TIMESTAMPTZ;
        IF exited_at < entered_at THEN
          RAISE EXCEPTION 'Lead stage exit cannot precede its entry' USING ERRCODE = '22023';
        END IF;
        IF abs(
          (item ->> 'duration_days')::NUMERIC
          - EXTRACT(EPOCH FROM (exited_at - entered_at)) / 86400
        ) > 0.000000001 THEN
          RAISE EXCEPTION 'Lead stage duration does not match its timestamps' USING ERRCODE = '22023';
        END IF;
      END IF;
      IF item ? 'duration_days' AND (item ->> 'duration_days')::NUMERIC < 0 THEN
        RAISE EXCEPTION 'Lead stage duration cannot be negative' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT records.stage_record ->> 'lead_id'
      FROM jsonb_array_elements(p_records) AS records(stage_record)
      GROUP BY records.stage_record ->> 'lead_id'
      HAVING count(*) FILTER (WHERE (records.stage_record ->> 'is_current')::BOOLEAN) <> 1
    ) THEN
      RAISE EXCEPTION 'Each lead must have exactly one current stage record' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR item IN
    SELECT records.record_data
    FROM jsonb_array_elements(p_records) AS records(record_data)
  LOOP
    SELECT * INTO existing_record
    FROM public.tenant_records
    WHERE tenant_id = profile.tenant_id
      AND resource = p_resource
      AND record_id = item ->> 'id'
    FOR UPDATE;

    IF FOUND AND existing_record.data IS DISTINCT FROM (item - '__expectedUpdatedAt') THEN
      IF NULLIF(item ->> '__expectedUpdatedAt', '') IS NULL
        OR (item ->> '__expectedUpdatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        OR (item ->> '__expectedUpdatedAt')::TIMESTAMPTZ IS DISTINCT FROM existing_record.updated_at THEN
        RAISE EXCEPTION 'Record modified by another user. Please reload.'
          USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.tenant_records AS current_record (tenant_id, resource, record_id, data, updated_at)
  SELECT profile.tenant_id, p_resource, records.record_data ->> 'id',
    records.record_data - '__expectedUpdatedAt', clock_timestamp()
  FROM jsonb_array_elements(p_records) AS records(record_data)
  ON CONFLICT (tenant_id, resource, record_id)
  DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = clock_timestamp()
  WHERE current_record.data IS DISTINCT FROM EXCLUDED.data;

  IF p_delete_missing AND p_resource NOT IN ('activities', 'audit-log') THEN
    DELETE FROM public.tenant_records AS existing
    WHERE existing.tenant_id = profile.tenant_id
      AND existing.resource = p_resource
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_records) AS records(record_data)
        WHERE records.record_data ->> 'id' = existing.record_id
      );
  END IF;

  RETURN COALESCE((
    SELECT jsonb_object_agg(record.record_id, jsonb_build_object(
      'updated_at', record.updated_at,
      'data', record.data
    ))
    FROM public.tenant_records AS record
    WHERE record.tenant_id = profile.tenant_id
      AND record.resource = p_resource
      AND record.record_id IN (
        SELECT records.record_data ->> 'id'
        FROM jsonb_array_elements(p_records) AS records(record_data)
      )
  ), '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_records(TEXT, JSONB, BOOLEAN) TO authenticated;

COMMIT;
