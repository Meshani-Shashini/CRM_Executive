BEGIN;

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
      AND NOT (NEW.resource = 'leads' AND link_row.resource = 'deals')
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

COMMIT;
