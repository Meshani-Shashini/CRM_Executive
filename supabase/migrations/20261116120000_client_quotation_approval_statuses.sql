BEGIN;

-- Update the installed validator without duplicating its full source-line checks.
DO $migration$
DECLARE
  definition TEXT;
  old_status_values CONSTANT TEXT := $$('Draft', 'Issued', 'Accepted', 'Rejected', 'Expired', 'Superseded')$$;
  new_status_values CONSTANT TEXT := $$('Draft', 'Pending Approval', 'Approved', 'Issued', 'Accepted', 'Rejected', 'Expired', 'Superseded')$$;
  old_source_transition CONSTANT TEXT := $$OR (OLD.data ->> 'status' = 'Draft' AND NEW.data ->> 'status' = 'Issued')$$;
  new_source_transition CONSTANT TEXT := $$OR (OLD.data ->> 'status' = 'Draft' AND NEW.data ->> 'status' = 'Issued')
    OR (OLD.data ->> 'status' = 'Draft' AND NEW.data ->> 'status' = 'Pending Approval')$$;
  old_authorizer_check CONSTANT TEXT := $$    OR NEW.data ->> 'authorizedBy' IS DISTINCT FROM OLD.data ->> 'authorizedBy'$$;
  old_guard_marker CONSTANT TEXT := $marker$  END IF;

  IF jsonb_typeof(NEW.data -> 'sections')$marker$;
  new_guard_marker CONSTANT TEXT := $marker$  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.data ->> 'status' <> 'Draft'
    AND NEW.data ->> 'authorizedBy' IS DISTINCT FROM OLD.data ->> 'authorizedBy'
    AND NOT (OLD.data ->> 'status' = 'Pending Approval' AND NEW.data ->> 'status' = 'Approved') THEN
    RAISE EXCEPTION 'Only an approval transition can record the quotation authorizer.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.data -> 'sections')$marker$;
BEGIN
  definition := pg_get_functiondef('public.validate_client_quotation()'::REGPROCEDURE);

  IF definition IS NULL
    OR strpos(definition, old_status_values) = 0
    OR strpos(definition, old_source_transition) = 0
    OR strpos(definition, old_authorizer_check) = 0
    OR strpos(definition, old_guard_marker) = 0 THEN
    RAISE EXCEPTION 'The installed client quotation validator does not match the expected version.';
  END IF;

  definition := replace(definition, old_status_values, new_status_values);
  definition := replace(definition, old_source_transition, new_source_transition);
  definition := replace(definition, old_authorizer_check, '');
  definition := replace(definition, old_guard_marker, new_guard_marker);
  EXECUTE definition;
END;
$migration$;

COMMIT;
