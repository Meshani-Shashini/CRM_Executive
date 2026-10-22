DO $$
DECLARE
  tenant UUID := '00000000-0000-4000-8000-000000000001';
  pipeline JSONB;
  stage JSONB;
  pipeline_id TEXT;
  stage_id TEXT;
  stage_index INTEGER;
BEGIN
  -- Keep the six product workflow pipelines canonical while preserving existing records.
  FOR pipeline IN
    SELECT value FROM jsonb_array_elements('[
      {"code":"COMMERCIAL_ENG","name":"Commercial Property & Engineering"},
      {"code":"MARINE_CARGO","name":"Marine Hull & Cargo Logistics"},
      {"code":"FINANCIAL_SPECIALTY","name":"Financial Surety & Specialty Risks"},
      {"code":"CASUALTY_LIABILITY","name":"Casualty & Liabilities"},
      {"code":"EMPLOYEE_BENEFITS","name":"Employee Benefits & Health"},
      {"code":"SME_VELOCITY","name":"SME & Velocity Packages"}
    ]'::JSONB)
  LOOP
    SELECT COALESCE(data ->> 'id', record_id)
    INTO pipeline_id
    FROM public.tenant_records
    WHERE tenant_id = tenant
      AND resource = 'pipelines'
      AND data ->> 'code' = pipeline ->> 'code'
    ORDER BY (data ->> 'isActive')::BOOLEAN DESC NULLS LAST
    LIMIT 1;

    IF pipeline_id IS NULL THEN
      pipeline_id := 'workflow-' || lower(pipeline ->> 'code');
      INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
      VALUES (
        tenant, 'pipelines', pipeline_id,
        jsonb_build_object(
          'id', pipeline_id,
          'tenantId', tenant,
          'name', pipeline ->> 'name',
          'code', pipeline ->> 'code',
          'isActive', TRUE
        )
      );
    ELSE
      UPDATE public.tenant_records
      SET data = jsonb_set(
        jsonb_set(data, '{name}', to_jsonb(pipeline ->> 'name'), TRUE),
        '{code}', to_jsonb(pipeline ->> 'code'), TRUE
      )
      WHERE tenant_id = tenant AND resource = 'pipelines' AND record_id = pipeline_id;
    END IF;

    FOR stage, stage_index IN
      SELECT value, ordinality::INTEGER
      FROM jsonb_array_elements(
        CASE pipeline ->> 'code'
          WHEN 'COMMERCIAL_ENG' THEN '[
            {"name":"Fact-Finding & Risk Survey","probability":20,"threshold":30},
            {"name":"Market Placement / Outender","probability":40,"threshold":30},
            {"name":"Quote Comparison & Presentation","probability":60,"threshold":14},
            {"name":"Underwriter Negotiation","probability":80,"threshold":14},
            {"name":"Policy Bound / Won","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'MARINE_CARGO' THEN '[
            {"name":"Vessel / Voyage Audit","probability":20,"threshold":14},
            {"name":"Slip Submission","probability":40,"threshold":14},
            {"name":"Carrier Review","probability":60,"threshold":14},
            {"name":"Cover Note Issued","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'FINANCIAL_SPECIALTY' THEN '[
            {"name":"Financial & AML Audit","probability":20,"threshold":30},
            {"name":"Capacity Check","probability":40,"threshold":21},
            {"name":"Underwriter Structuring","probability":60,"threshold":21},
            {"name":"Bound","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'CASUALTY_LIABILITY' THEN '[
            {"name":"Payroll / Fee Census","probability":20,"threshold":14},
            {"name":"Carrier Terms","probability":40,"threshold":14},
            {"name":"Proposal Presentation","probability":60,"threshold":14},
            {"name":"Placed","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'EMPLOYEE_BENEFITS' THEN '[
            {"name":"Census Ingestion","probability":20,"threshold":7},
            {"name":"TPA / Network Selection","probability":40,"threshold":7},
            {"name":"Pricing Tier Presentation","probability":60,"threshold":7},
            {"name":"Enrollment Hand-off","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
          WHEN 'SME_VELOCITY' THEN '[
            {"name":"Inbound Lead","probability":20,"threshold":2},
            {"name":"Automated Quote Issued","probability":45,"threshold":2},
            {"name":"Payment Collection","probability":75,"threshold":7},
            {"name":"Policy Issued","probability":100,"threshold":0},
            {"name":"Lost / Declined","probability":0,"threshold":0}
          ]'
        END::JSONB
      ) WITH ORDINALITY
    LOOP
      SELECT record_id INTO stage_id
      FROM public.tenant_records
      WHERE tenant_id = tenant
        AND resource = 'pipeline-stages'
        AND data ->> 'pipelineId' = pipeline_id
        AND (data ->> 'stageOrder')::INTEGER = stage_index
      LIMIT 1;

      IF stage_id IS NULL THEN
        stage_id := pipeline_id || '-stage-' || stage_index::TEXT;
        INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
        VALUES (
          tenant, 'pipeline-stages', stage_id,
          jsonb_build_object(
            'id', stage_id, 'pipelineId', pipeline_id,
            'name', stage ->> 'name', 'stageOrder', stage_index,
            'winProbabilityPct', (stage ->> 'probability')::INTEGER,
            'stagnationDaysThreshold', (stage ->> 'threshold')::INTEGER
          )
        );
      ELSE
        UPDATE public.tenant_records
        SET data = jsonb_build_object(
          'id', stage_id, 'pipelineId', pipeline_id,
          'name', stage ->> 'name', 'stageOrder', stage_index,
          'winProbabilityPct', (stage ->> 'probability')::INTEGER,
          'stagnationDaysThreshold', (stage ->> 'threshold')::INTEGER
        )
        WHERE tenant_id = tenant AND resource = 'pipeline-stages' AND record_id = stage_id;
      END IF;
      stage_id := NULL;
    END LOOP;
    pipeline_id := NULL;
  END LOOP;

  UPDATE public.tenant_records
  SET data = jsonb_set(data, '{isActive}', 'false'::JSONB, TRUE)
  WHERE tenant_id = tenant
    AND resource = 'pipelines'
    AND COALESCE(data ->> 'code', '') NOT IN (
      'COMMERCIAL_ENG', 'MARINE_CARGO', 'FINANCIAL_SPECIALTY',
      'CASUALTY_LIABILITY', 'EMPLOYEE_BENEFITS', 'SME_VELOCITY'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_policy_bound_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bound_stage BOOLEAN;
  previous_bound_stage BOOLEAN;
  client_record public.tenant_records%ROWTYPE;
  renewal_pipeline public.tenant_records%ROWTYPE;
  renewal_stage public.tenant_records%ROWTYPE;
  expiry_date DATE;
  renewal_close_date DATE;
  invoice_id TEXT;
  renewal_id TEXT;
  renewal_value NUMERIC;
BEGIN
  IF NEW.resource <> 'deals' THEN
    RETURN NEW;
  END IF;

  bound_stage := lower(COALESCE(NEW.data ->> 'stage', '')) = 'policy bound / won';
  previous_bound_stage := TG_OP = 'UPDATE'
    AND lower(COALESCE(OLD.data ->> 'stage', '')) = 'policy bound / won';
  IF NOT bound_stage OR previous_bound_stage THEN
    RETURN NEW;
  END IF;

  invoice_id := 'invoice-for-' || NEW.record_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE tenant_id = NEW.tenant_id
      AND resource = 'invoices'
      AND data ->> 'linkedDealId' = NEW.record_id
  ) THEN
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES (
      NEW.tenant_id,
      'invoices',
      invoice_id,
      jsonb_build_object(
        'id', invoice_id,
        'number', 'INV-' || right(NEW.record_id, 8),
        'clientId', COALESCE(NEW.data ->> 'clientId', ''),
        'clientName', COALESCE(NEW.data ->> 'client', ''),
        'insurer', COALESCE(NEW.data ->> 'insurer', 'Not assigned'),
        'policyNo', NEW.record_id,
        'issueDate', CURRENT_DATE,
        'dueDate', CURRENT_DATE + 30,
        'status', 'Pending',
        'items', jsonb_build_array(jsonb_build_object(
          'description', 'Premium for ' || COALESCE(NEW.data ->> 'product', 'Policy'),
          'qty', 1,
          'unitPrice', COALESCE((NEW.data ->> 'value')::NUMERIC, 0),
          'vatRate', 0
        )),
        'installments', jsonb_build_array(jsonb_build_object(
          'id', invoice_id || '-installment',
          'label', 'Single Payment',
          'due', CURRENT_DATE + 30,
          'amount', COALESCE((NEW.data ->> 'value')::NUMERIC, 0),
          'paid', FALSE
        )),
        'currency', COALESCE(NEW.data ->> 'currency', 'MVR'),
        'linkedDealId', NEW.record_id
      )
    );
  END IF;

  SELECT * INTO client_record
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'clients'
    AND (
      (NEW.data ->> 'clientId' IS NOT NULL AND data ->> 'id' = NEW.data ->> 'clientId')
      OR lower(data ->> 'name') = lower(NEW.data ->> 'client')
    )
  LIMIT 1;

  expiry_date := NULLIF(COALESCE(NEW.data ->> 'policyExpiry', client_record.data ->> 'expiry'), '')::DATE;
  IF expiry_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO renewal_pipeline
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipelines'
    AND data ->> 'code' = 'RENEWALS'
    AND COALESCE((data ->> 'isActive')::BOOLEAN, FALSE)
  LIMIT 1;
  IF renewal_pipeline.record_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO renewal_stage
  FROM public.tenant_records
  WHERE tenant_id = NEW.tenant_id
    AND resource = 'pipeline-stages'
    AND data ->> 'pipelineId' = COALESCE(renewal_pipeline.data ->> 'id', renewal_pipeline.record_id)
  ORDER BY (data ->> 'stageOrder')::INTEGER
  LIMIT 1;
  IF renewal_stage.record_id IS NULL THEN
    RETURN NEW;
  END IF;

  renewal_id := 'renewal-for-' || NEW.record_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_records
    WHERE tenant_id = NEW.tenant_id AND resource = 'deals' AND record_id = renewal_id
  ) THEN
    renewal_close_date := expiry_date - 90;
    renewal_value := COALESCE((client_record.data ->> 'premium')::NUMERIC, (NEW.data ->> 'value')::NUMERIC, 0);
    INSERT INTO public.tenant_records (tenant_id, resource, record_id, data)
    VALUES (
      NEW.tenant_id,
      'deals',
      renewal_id,
      jsonb_build_object(
        'id', renewal_id,
        'pipelineId', COALESCE(renewal_pipeline.data ->> 'id', renewal_pipeline.record_id),
        'createdAt', NOW(),
        'renewalForClientId', NULLIF(client_record.data ->> 'id', ''),
        'renewalForDealId', NEW.record_id,
        'renewalExpiry', expiry_date,
        'policyExpiry', expiry_date,
        'client', COALESCE(NEW.data ->> 'client', client_record.data ->> 'name', ''),
        'product', COALESCE(NEW.data ->> 'product', 'Insurance renewal'),
        'value', renewal_value,
        'weighted', renewal_value * ((renewal_stage.data ->> 'winProbabilityPct')::NUMERIC / 100),
        'currency', COALESCE(NEW.data ->> 'currency', 'MVR'),
        'stage', renewal_stage.data ->> 'name',
        'probability', (renewal_stage.data ->> 'winProbabilityPct')::INTEGER,
        'ownerId', COALESCE(NEW.data ->> 'ownerId', client_record.data ->> 'ownerId', ''),
        'closeDate', renewal_close_date,
        'insurer', COALESCE(NEW.data ->> 'insurer', client_record.data ->> 'insurer', 'Not assigned'),
        'nextActivityAt', renewal_close_date,
        'nextActivityTitle', 'Start 90-day renewal retention review'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_records_policy_bound_side_effects ON public.tenant_records;
CREATE TRIGGER tenant_records_policy_bound_side_effects
AFTER INSERT OR UPDATE OF data ON public.tenant_records
FOR EACH ROW EXECUTE FUNCTION public.create_policy_bound_side_effects();

-- Master policy-type catalog for all products classified from NM CODES.xlsx.
CREATE TABLE IF NOT EXISTS public.policy_types (
  tenant_id UUID NOT NULL,
  class_type TEXT NOT NULL,
  policy_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_pipeline_code TEXT NOT NULL,
  standard_brokerage_rate_pct NUMERIC(5, 2) NOT NULL CHECK (standard_brokerage_rate_pct BETWEEN 0 AND 100),
  is_statutory_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  sales_cycle_velocity TEXT NOT NULL DEFAULT '14–30 Days',
  risk_level TEXT NOT NULL DEFAULT 'Medium',
  key_underwriting_intake_artifacts TEXT NOT NULL DEFAULT 'Completed proposal form, asset/risk schedule and prior claims history',
  PRIMARY KEY (tenant_id, policy_code)
);

ALTER TABLE public.policy_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_types ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.policy_types ADD COLUMN IF NOT EXISTS sales_cycle_velocity TEXT NOT NULL DEFAULT '14–30 Days';
ALTER TABLE public.policy_types ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'Medium';
ALTER TABLE public.policy_types ADD COLUMN IF NOT EXISTS key_underwriting_intake_artifacts TEXT NOT NULL DEFAULT 'Completed proposal form, asset/risk schedule and prior claims history';
DROP POLICY IF EXISTS "Tenant members can read policy types" ON public.policy_types;
CREATE POLICY "Tenant members can read policy types"
  ON public.policy_types FOR SELECT TO authenticated
  USING (tenant_id = (
    SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
  ));
GRANT SELECT ON public.policy_types TO authenticated;

INSERT INTO public.policy_types (
  tenant_id, class_type, policy_code, name, default_pipeline_code,
  standard_brokerage_rate_pct, is_statutory_mandatory
)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'AB', 'Advance Bond', 'FINANCIAL_SPECIALTY', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'BB', 'Bid Bond', 'FINANCIAL_SPECIALTY', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'CB', 'Performance Bond', 'FINANCIAL_SPECIALTY', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'CM', 'Comprehensive Machinery', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'CP', 'Electronic Equipment', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'CR', 'Computer Crime', 'FINANCIAL_SPECIALTY', 17.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'FZ', 'Contractor''s Plant & Machinery', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'IR', 'Industrial All Risks (Engineering)', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'LM', 'Machinery Con Loss', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'NC', 'Contractors All Risks', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'NE', 'Erection All Risks', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'NM', 'Machinery Breakdown', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'CF', 'Commercial Fire', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'DF', 'Dwelling Fire', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'FIR', 'Industrial All Risks (Fire)', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'FY', 'Terrorism and Sabotage', 'FINANCIAL_SPECIALTY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'HC', 'Hotel Combine', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'LP', 'Consequential Loss', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'PR', 'Property All Risk', 'COMMERCIAL_ENG', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'EC', 'Export Certificate', 'MARINE_CARGO', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'EP', 'Export Policy', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'IC', 'Import Certificate', 'MARINE_CARGO', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'IP', 'Import Policy', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'LC', 'Land Cover', 'MARINE_CARGO', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'LT', 'Land Transit', 'MARINE_CARGO', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'OP', 'Open Policy', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'RJ', 'Rejection Cover', 'MARINE_CARGO', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'SH', 'Hull Policy', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'ZZ', 'Special Marine Policy', 'MARINE_CARGO', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'AL', 'Airport Owners & Operators Liability', 'FINANCIAL_SPECIALTY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'RETAIL_PERSONAL', 'AP', 'Personal Accident', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'BL', 'Bankers Indemnity', 'FINANCIAL_SPECIALTY', 17.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'CG', 'Fidelity Guarantee', 'CASUALTY_LIABILITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'RETAIL_PERSONAL', 'CT', 'Travelclasics', 'SME_VELOCITY', 20.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'DL', 'Doctors Liability', 'CASUALTY_LIABILITY', 20.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'SPECIALTY_FINANCIAL', 'DO', 'Directors & Officers Liability', 'FINANCIAL_SPECIALTY', 20.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'EL', 'Workmen''s Compensation', 'CASUALTY_LIABILITY', 12.50, TRUE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'FL', 'Freight Forwarders Liability', 'CASUALTY_LIABILITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'GL', 'Plate Glass Insurance', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'GT', 'Goods in Transit', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'HB', 'Burglary & Housebreaking', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'EMPLOYEE_BENEFITS', 'HE', 'Surgical and Hospital Expenses', 'EMPLOYEE_BENEFITS', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'MARINE_AVIATION', 'HR', 'Hull All Risk', 'MARINE_CARGO', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'MR', 'All Risks', 'SME_VELOCITY', 15.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'PROPERTY', 'MT', 'Money in Transit', 'COMMERCIAL_ENG', 12.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'PL', 'Product Liability', 'CASUALTY_LIABILITY', 17.50, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'PN', 'Professional Indemnity Insurance', 'CASUALTY_LIABILITY', 20.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'EMPLOYEE_BENEFITS', 'SI', 'Suwa Sampatha International', 'EMPLOYEE_BENEFITS', 10.00, FALSE),
  ('00000000-0000-4000-8000-000000000001', 'CASUALTY_LIABILITY', 'TL', 'Public Liability', 'CASUALTY_LIABILITY', 15.00, FALSE)
ON CONFLICT (tenant_id, policy_code) DO UPDATE SET
  class_type = EXCLUDED.class_type,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_pipeline_code = EXCLUDED.default_pipeline_code,
  standard_brokerage_rate_pct = EXCLUDED.standard_brokerage_rate_pct,
  is_statutory_mandatory = EXCLUDED.is_statutory_mandatory;

-- The NM CODES description is the catalog display name for the seeded products.
UPDATE public.policy_types
SET description = name
WHERE description IS NULL OR description = '';

-- Populate the final matrix columns for every seeded NM CODES product.
UPDATE public.policy_types
SET
  sales_cycle_velocity = CASE
    WHEN policy_code IN ('AB', 'BB', 'AP', 'CT', 'DF', 'EC', 'IC', 'LC', 'LT') THEN '3–7 Days'
    WHEN policy_code IN ('CB', 'CP', 'CF', 'NM', 'PR', 'RJ', 'GT', 'GL', 'HB', 'MR', 'MT', 'TL') THEN '7–14 Days'
    WHEN policy_code = 'IR' THEN '30–60 Days'
    ELSE '14–30 Days'
  END,
  risk_level = CASE
    WHEN policy_code IN ('IR', 'CR', 'FY', 'BL', 'DO') THEN 'Very High'
    WHEN policy_code IN ('AB', 'BB', 'CB', 'CM', 'FZ', 'LM', 'NC', 'NE', 'NM', 'FIR', 'HC', 'LP', 'OP', 'RJ', 'SH', 'ZZ', 'AL', 'DL', 'EL', 'FL', 'HR', 'PL', 'PN') THEN 'High'
    WHEN policy_code IN ('AP', 'CT', 'DF') THEN 'Low'
    ELSE 'Medium'
  END,
  key_underwriting_intake_artifacts = CASE
    WHEN policy_code = 'AB' THEN 'Contract award letter, bank guarantee facility'
    WHEN policy_code = 'BB' THEN 'Tender invitation, bid terms, bank guarantee facility'
    WHEN policy_code = 'CB' THEN 'Executed contract, performance security wording, bank guarantee facility'
    WHEN policy_code IN ('FZ', 'NC', 'NE') THEN 'Contract award letter, Bill of Quantities (BOQ), project schedule'
    WHEN policy_code IN ('CM', 'NM') THEN 'Machinery schedule, replacement values, maintenance records, risk survey'
    WHEN policy_code = 'CR' THEN 'Cyber questionnaire, IT controls, incident history, business continuity plan'
    WHEN policy_code IN ('IR', 'FIR') THEN 'Statement of values, engineering/fire survey, business interruption values, loss history'
    WHEN policy_code IN ('CF', 'PR', 'MR') THEN 'Asset schedule, replacement values, security details and risk survey'
    WHEN policy_code IN ('DF', 'HB') THEN 'Property/contents schedule, security details and loss history'
    WHEN policy_code IN ('LM', 'LP') THEN 'Gross profit worksheet, indemnity period, financial statements, loss history'
    WHEN policy_code IN ('EC', 'IC') THEN 'Import/export invoice, certificate details, cargo description and route'
    WHEN policy_code IN ('EP', 'IP') THEN 'Import/export declaration, invoice, packing list, transit route and terms'
    WHEN policy_code IN ('LC', 'LT', 'GT') THEN 'Transit route, invoice, cargo description and conveyance details'
    WHEN policy_code IN ('OP', 'RJ', 'ZZ') THEN 'Cargo schedule, routes, shipment profile and loss history'
    WHEN policy_code IN ('SH', 'HR') THEN 'Vessel particulars, valuation, class certificate, survey and loss history'
    WHEN policy_code = 'AL' THEN 'Airport operations profile, passenger/flight data, contracts and claims history'
    WHEN policy_code = 'AP' THEN 'Proposal form, age and occupation schedule, prior claims history'
    WHEN policy_code = 'BL' THEN 'Financial statements, banking controls, audit reports and claims history'
    WHEN policy_code = 'CG' THEN 'Employee schedule, duties, internal controls and fidelity history'
    WHEN policy_code = 'CT' THEN 'Traveller details, itinerary, age and destination information'
    WHEN policy_code = 'DL' THEN 'Professional credentials, practice profile, patient volume and claims history'
    WHEN policy_code = 'DO' THEN 'Corporate profile, financial statements, governance details and claims history'
    WHEN policy_code = 'EL' THEN 'Employee census, payroll, job duties, workplace controls and claims history'
    WHEN policy_code = 'FL' THEN 'Freight operations profile, contracts, turnover, routes and claims history'
    WHEN policy_code = 'GL' THEN 'Glass schedule, premises details, measurements and replacement values'
    WHEN policy_code IN ('HE', 'SI') THEN 'Employee census, benefits schedule, claims/utilisation history and network details'
    WHEN policy_code = 'PL' THEN 'Business profile, product/service details, turnover and claims history'
    WHEN policy_code = 'PN' THEN 'Professional credentials, services profile, revenue split and claims history'
    WHEN policy_code = 'MT' THEN 'Cash handling profile, transit routes, security controls and loss history'
    WHEN policy_code = 'TL' THEN 'Business profile, premises/operations details, contracts and claims history'
    ELSE 'Completed proposal form, asset/risk schedule and prior claims history'
  END
WHERE tenant_id = '00000000-0000-4000-8000-000000000001';

-- The frontend persists administrator-managed catalog overrides in tenant_records.
-- Re-declare the synchronizer here so existing deployments accept the products collection.
CREATE OR REPLACE FUNCTION public.sync_tenant_records(p_resource TEXT, p_records JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.user_profiles%ROWTYPE;
  allowed_resources TEXT[] := ARRAY[
    'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'invoices', 'payments',
    'tax-rates', 'pipelines', 'pipeline-stages', 'stage-history',
    'company', 'email-templates', 'products', 'policy-types'
  ];
  allowed BOOLEAN;
BEGIN
  SELECT * INTO profile FROM public.user_profiles
  WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile not found' USING ERRCODE = '42501';
  END IF;
  IF p_resource IS NULL OR p_resource <> ALL(allowed_resources)
    OR jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid record collection' USING ERRCODE = '22023';
  END IF;

  allowed := CASE profile.role
    WHEN 'System Admin' THEN TRUE
    WHEN 'Sales' THEN p_resource = ANY(ARRAY[
      'leads', 'clients', 'customer-lookups', 'activities', 'deals', 'stage-history'
    ])
    WHEN 'Accountant' THEN p_resource = ANY(ARRAY['invoices', 'payments'])
    ELSE FALSE
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Role is not allowed to update this collection' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) AS records(item)
    WHERE jsonb_typeof(item) <> 'object'
      OR jsonb_typeof(item -> 'id') <> 'string'
      OR COALESCE(length(item ->> 'id'), 0) = 0
  ) THEN
    RAISE EXCEPTION 'Every record must have a non-empty string id' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_records (tenant_id, resource, record_id, data, updated_at)
  SELECT profile.tenant_id, p_resource, item ->> 'id', item, NOW()
  FROM jsonb_array_elements(p_records) AS records(item)
  ON CONFLICT (tenant_id, resource, record_id)
  DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

  DELETE FROM public.tenant_records AS existing
  WHERE existing.tenant_id = profile.tenant_id
    AND existing.resource = p_resource
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_records) AS records(item)
      WHERE item ->> 'id' = existing.record_id
    );
END;
$$;
