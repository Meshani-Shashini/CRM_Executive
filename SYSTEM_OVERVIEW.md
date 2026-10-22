# System overview

## What this system does

The Insurance Brokers Management System (IBMS) is a browser-based CRM for an insurance brokerage. It provides interfaces for managing leads, clients, sales deals and pipelines, policy and finance records, and administration. The frontend is a React single-page application written in TypeScript and built with Vite. Supabase provides authentication, user profiles, database storage, and an Edge Function for administrator-created accounts.

## How a session works

1. `src/main.tsx` mounts the React app, and `src/App.tsx` wraps the application shell in `AppProvider`.
2. With normal authentication, the provider restores any saved Supabase session and loads the associated user profile. The application shows a brief session-check screen while this runs. Without a signed-in user, it displays the login and client-registration screen.
3. After login, the provider loads tenant records from Supabase. Pages use the shared state exposed by `useApp()`. With the local development demo bypass enabled, login uses the configured demo credentials, records remain empty and in memory, and remote persistence is skipped.
4. The sidebar and dashboard drill-down links navigate using URL hashes such as `#/leads` or `#/leads?status=active`. The destination list view reads those query parameters and applies the requested filter. The shell checks the current user's role before showing a module; disallowed routes display an access-restricted message.
5. In a normal Supabase session, changes to writable shared collections are debounced briefly, then synchronized through the `sync_tenant_records` RPC. Read or save errors are surfaced in the application shell.

## Main modules

| Module | Current behavior |
| --- | --- |
| Dashboard | Summarizes current leads, deals, clients, activities, and team records; empty collections show empty-state messages. |
| Leads | Admins and Sales can create and edit individual leads with a sales person, searchable organization, title, USD/MVR value, insurance product, owner, expected close date, pipeline, and stage. The insurance product is selected before routing; the NM CODES mapping automatically pre-selects the correct business pipeline and first stage. Sales users are automatically assigned themselves as owner and see only their own leads, while System Admins retain oversight of all leads. A new organization can be added in an overlay without closing the lead form. Missing products can be quick-added inline with a code, category, and pipeline. Existing legacy leads continue to display using MVR and legacy field fallbacks. |
| Clients | Searches and creates insured-entity customer accounts with classification, MIRA/compliance, Maldives location, stakeholder, target portfolio, and next-action details; logs client activities and quote details. Administrators can edit or delete client records. Client Portal users see and update contact details only for the client record linked to their profile. Custom dropdown values are persisted in the tenant-scoped `customer-lookups` collection. |
| Deals | Creates deals attached to configured pipelines and stages, records intent tier (P1/P2/P3), and displays values and weighted values. Product selection comes first; the mapped NM CODES pipeline and first stage are pre-selected automatically. Users can adjust the routed pipeline/stage and quick-add a missing product inline. Older deals without an intent tier are categorized from their probability. |
| Pipelines | Product routing uses six dedicated business pipelines: Commercial Property & Engineering, Marine Hull & Cargo Logistics, Financial Surety & Specialty Risks, Casualty & Liabilities, Employee Benefits & Health, and SME & Velocity Packages. Each routed lead/deal starts in the selected pipeline's first stage and can progress through configured stages with probability, outcome, loss reason, stage history, stagnation/momentum, intent, and health reporting. Won and lost outcomes are stored explicitly. Annual renewals can also be staged automatically for active policies expiring within the next three calendar months. |
| Funnels | Calculates stage-entry and conversion metrics from deal stage history. |
| Invoices and Payments | Creates invoices, records payments, calculates invoice totals, and updates invoice payment status. |
| Settings | Provides administrator controls for company settings, tax rates, email templates, and user provisioning. Admins can edit user display names, job titles, and roles; raw account email addresses are hidden in the user list and auth email is not editable here. |
| Calendar | Renders a calendar and upcoming-events area; no event collection is currently connected, so it starts empty. Calendar event dates use the shared date display formatter. |
| MIRA Form 1 | Provides a report layout, date filters, print, and CSV export; its row collection is currently empty and not connected to CRM records. |
| Quotation Request Slips | Shows an empty list and a request form; submitting the form currently closes it without persisting a slip. |

## Insurance product catalog and routing

The system includes all 49 products classified from `NM CODES.xlsx`. The shared product catalog in `src/data/catalogs.ts` and the tenant-scoped `public.policy_types` table contain the product code, description, core industry class, standard brokerage percentage, statutory mandatory flag, and default pipeline code. The seed is defined in migration `20261022100000_insurance_brokerage_workflow.sql` and is idempotent by tenant and policy code. Administrators manage these fields from the Settings **Item / Product Management** section; additions and edits are synchronized through the shared `products` tenant resource and immediately feed Lead and Deal selectors. Product creation is intentionally centralized in Settings rather than the Lead/Deal modals.

The six canonical product pipelines are:

- `COMMERCIAL_ENG` — Commercial Property & Engineering
- `MARINE_CARGO` — Marine Hull & Cargo Logistics
- `FINANCIAL_SPECIALTY` — Financial Surety & Specialty Risks
- `CASUALTY_LIABILITY` — Casualty & Liabilities
- `EMPLOYEE_BENEFITS` — Employee Benefits & Health
- `SME_VELOCITY` — SME & Velocity Packages

Lead and Deal forms use the product's `defaultPipelineCode` to pre-select the matching active pipeline and its first stage. A product can be quick-added inline when it is absent from the catalog; the new item receives a unique code, description, category, class, selected pipeline, brokerage percentage, and mandatory status for the current form session. The catalog's standard percentage is applied to the Total Insured Value to calculate a tentative brokerage commission / profit-margin budget.

## Date handling and form conventions

All rendered dates use the shared `formatDate` helper in `src/utils/date.ts` and display as `DD-MMM-YYYY`, for example `22-Oct-2026`. All editable date fields use the shared `DateInput` component, which displays `DD-MMM-YYYY`, provides a clickable calendar icon and browser calendar popup, validates real calendar dates, and submits ISO `YYYY-MM-DD` values to existing form and persistence logic. This applies to Lead and Deal close dates, client policy expiry and next-action dates, invoice dates, payment dates, and MIRA report filters. Native HTML pattern validation is intentionally not used on the custom text field; form handlers validate the canonical ISO value instead.

Lead and Deal records retain both the Total Insured Value and the selected product's brokerage rate and calculated commission budget. The forms show the tentative budget while the amount is entered, and list/table views show it alongside the insured value. Calculations use the same currency as the entered value; legacy records fall back to the current catalog rate when available.

Other navigation entries—such as plans, reports, documents, quotations, internal slips, payment requests, renewals, information requests, rate cards, targets, and audit log—currently render “Coming soon” placeholder pages. The top-bar search and notification controls are visual UI only.

## Currency handling

Quote premiums and deal values support MVR and USD. Choosing USD prefills an editable conversion rate of **15.42 MVR per USD**; this is a configurable form default, not a live exchange-rate feed. The entered amount and rate are saved with the quote or deal, and the form shows the MVR equivalent. MVR amounts are not converted. Deal totals and weighted summaries normalize each deal to MVR using its stored rate.

## Roles and access

Application role keys map to Supabase profile roles:

| Application role | Supabase role | Typical access |
| --- | --- | --- |
| `admin` | System Admin | All implemented modules, settings, user administration, and supported record collections. |
| `sales` | Sales | Leads, deals, clients, pipelines, calendar, and sales workflows. |
| `finance` | Accountant | Dashboard, clients, invoices, payments, reports, funnels, and MIRA. |
| `client` | Client | Matched client details, documents, invoices, and payments. |

The frontend hides or blocks modules according to role, while PostgreSQL row-level security and the write RPC enforce data permissions independently. New sign-ups receive the Client role and cannot choose their own staff role. Administrator account creation uses the `admin-create-user` Edge Function, which verifies the caller and uses the Supabase service-role key only within the function runtime.

The Admin profile menu and sidebar provide Admin, Sales, Finance, and Client view-preview buttons. Previewing another role changes the visible navigation and routes but does not change the authenticated user, Supabase role, or database permissions. This is an admin-only UI preview, not user impersonation. Lead list visibility is derived from the authenticated app role and `ownerId`: System Admins see all leads, while Sales users see only their own. Legacy visibility metadata is retained only for backwards-compatible reads and is no longer shown or selectable.

## Authentication modes

- **Normal mode:** Supabase Auth verifies the account credentials. `VITE_ADMIN_LOGIN_EMAIL` optionally maps the login name `admin` to a real Supabase email; it does not bypass password verification. User profiles supply the role used by the app.
- **Local demo mode:** `VITE_AUTH_BYPASS=true` enables a development-only login when running Vite in development mode. `VITE_DEMO_ADMIN_USERNAME` and `VITE_DEMO_ADMIN_PASSWORD` configure its credentials. This mode skips Supabase sign-in and data persistence and disables registration. Vite `VITE_*` settings are exposed to browser code, so demo credentials must be disposable and the bypass must not be used as production authentication.

## Data and persistence

The app's shared state covers leads, clients, activities, deals, invoices, payments, tax rates, pipelines, pipeline stages, deal stage history, company settings, email templates, customer lookup values, and the administrator-managed product catalog. CRM transaction collections begin empty. Pipeline and policy catalog bootstrap is handled by `20261022100000_insurance_brokerage_workflow.sql`, which preserves existing records, seeds the six product pipelines, creates the tenant-scoped `policy_types` table with all 49 mapped products, and creates policy-bound invoice and renewal side effects. Before any tenant-record write, the shared synchronizer normalizes valid string IDs from record IDs, product codes, policy codes, or stored record IDs and filters malformed items, preventing invalid collection payloads. Bundled product codes and insurer options are reference catalogs, not example customer records.

In a connected session, records are represented in the tenant-scoped `tenant_records` table as JSON data keyed by tenant, resource, and record ID. Reads are filtered by PostgreSQL row-level security. Staff writes go through the `sync_tenant_records` RPC, which validates record IDs and checks the caller's role before synchronizing a collection. Client Portal users are linked to one client by `user_profiles.client_record_id`; the dedicated `update_own_client_contact` RPC permits only that user's phone, contact email, address, and contact-person fields to change. Supabase Auth sessions are persisted in the browser.

The deployment currently uses a fixed tenant ID (`00000000-0000-4000-8000-000000000001`); it is not a tenant-selection or tenant-provisioning system. Migration `20261019020000_clear_demo_tenant_records.sql` deletes all CRM rows for that tenant if applied, but preserves Auth accounts and user profiles. Review the target database before applying it.

The New Customer Account form stores insured-entity details, stakeholder screening status, target lines/premium, and the required next action in the client record. Its searchable lookup options are tenant-level state; new options are synced through `sync_tenant_records` and require migration `20261020070000_customer_account_lookups.sql`. MIRA/NID checks and PEP/sanctions screening are not connected to external verification providers; the form records user-entered statuses only.

## Local setup

Install packages with `npm install`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env` file for normal Supabase usage. Configure `VITE_ADMIN_LOGIN_EMAIL` if using the `admin` email alias. Start the frontend with `npm run dev`. The project also provides `npm run typecheck`, `npm run lint`, and `npm run build`.

Database migration, administrator promotion, Edge Function deployment, and environment setup instructions are in [SUPABASE.md](./SUPABASE.md).
