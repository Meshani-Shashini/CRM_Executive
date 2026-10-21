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
| Leads | Admins and Sales can create and edit leads with a sales person, searchable organization, title, pipeline, USD/MVR value, insurance product class, owner, and expected close date. New leads are stored as individual records; Sales users are automatically assigned themselves as owner and see only their own leads, while System Admins retain oversight of all leads. A new organization can be added in an overlay without closing the lead form. Existing legacy leads continue to display using MVR and legacy field fallbacks. |
| Clients | Searches and creates insured-entity customer accounts with classification, MIRA/compliance, Maldives location, stakeholder, target portfolio, and next-action details; logs client activities and quote details. Administrators can edit or delete client records. Client Portal users see and update contact details only for the client record linked to their profile. Custom dropdown values are persisted in the tenant-scoped `customer-lookups` collection. |
| Deals | Creates deals attached to configured pipelines and stages, records intent tier (P1/P2/P3), and displays values and weighted values. Older deals without an intent tier are categorized from their probability. |
| Pipelines | The Commercial Brokerage pipeline uses exactly six stages: Fact-Finding & Risk Survey (20%), Market Placement / Outender (40%), Quote Comparison & Presentation (60%), Underwriter Negotiation (80%), Policy Bound / won (100%), and Lost / Declined (0%). Won deals are confirmed at the bound stage; Lost/Declined requires a reason and outcomes are stored explicitly for reporting. Administrators can create additional Commercial Property & Marine, Retail & Personal Lines, Annual Renewals, or Claims pipelines from templates and configure their stages. Active client policies expiring within the next three calendar months are automatically staged once per client/expiry in an active Annual Renewals pipeline. Won renewals remain there, with a prompt to proceed with invoicing and active-sales follow-up. Stage history tracks time in stage, proposal details, outcome, and loss reasons. Kanban cards show momentum and health states based on each stage's configured stagnation threshold, plus intent tier and a rule-based health score from win probability and stage age. Below 40% of the threshold, momentum is Surging; 40–69% is Steady; 70–99% is Stalling/At Risk; at or above 100% is Rotting. The score weights win probability at 65% and remaining threshold-based freshness at 35%. Health and intent chips filter the board. The score is a transparent heuristic, not an AI-generated prediction. |
| Funnels | Calculates stage-entry and conversion metrics from deal stage history. |
| Invoices and Payments | Creates invoices, records payments, calculates invoice totals, and updates invoice payment status. |
| Settings | Provides administrator controls for company settings, tax rates, email templates, and user provisioning. Admins can edit user display names, job titles, and roles; raw account email addresses are hidden in the user list and auth email is not editable here. |
| Calendar | Renders a calendar and upcoming-events area; no event collection is currently connected, so it starts empty. |
| MIRA Form 1 | Provides a report layout, date filters, print, and CSV export; its row collection is currently empty and not connected to CRM records. |
| Quotation Request Slips | Shows an empty list and a request form; submitting the form currently closes it without persisting a slip. |

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

The app's shared state covers leads, clients, activities, deals, invoices, payments, tax rates, pipelines, pipeline stages, deal stage history, company settings, and email templates. CRM transaction collections begin empty; the default Commercial Brokerage pipeline and stages are seeded by migration `20261020140000_default_brokerage_pipeline.sql` and upgraded non-destructively by `20261021100000_commercial_pipeline_dispositions.sql`. Bundled product codes and insurer options are reference catalogs, not example customer records.

In a connected session, records are represented in the tenant-scoped `tenant_records` table as JSON data keyed by tenant, resource, and record ID. Reads are filtered by PostgreSQL row-level security. Staff writes go through the `sync_tenant_records` RPC, which validates record IDs and checks the caller's role before synchronizing a collection. Client Portal users are linked to one client by `user_profiles.client_record_id`; the dedicated `update_own_client_contact` RPC permits only that user's phone, contact email, address, and contact-person fields to change. Supabase Auth sessions are persisted in the browser.

The deployment currently uses a fixed tenant ID (`00000000-0000-4000-8000-000000000001`); it is not a tenant-selection or tenant-provisioning system. Migration `20261019020000_clear_demo_tenant_records.sql` deletes all CRM rows for that tenant if applied, but preserves Auth accounts and user profiles. Review the target database before applying it.

The New Customer Account form stores insured-entity details, stakeholder screening status, target lines/premium, and the required next action in the client record. Its searchable lookup options are tenant-level state; new options are synced through `sync_tenant_records` and require migration `20261020070000_customer_account_lookups.sql`. MIRA/NID checks and PEP/sanctions screening are not connected to external verification providers; the form records user-entered statuses only.

## Local setup

Install packages with `npm install`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env` file for normal Supabase usage. Configure `VITE_ADMIN_LOGIN_EMAIL` if using the `admin` email alias. Start the frontend with `npm run dev`. The project also provides `npm run typecheck`, `npm run lint`, and `npm run build`.

Database migration, administrator promotion, Edge Function deployment, and environment setup instructions are in [SUPABASE.md](./SUPABASE.md).
