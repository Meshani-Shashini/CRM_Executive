# System overview

## What the system is

The Insurance Brokers Management System (IBMS) is a browser-based CRM for an insurance brokerage. It brings together lead and deal tracking, client records, policy-related workflows, invoices and payments, pipeline configuration, and administration. The interface is a single-page React application; Supabase provides sign-in, user profiles, and shared record storage.

## Application flow

1. `src/main.tsx` mounts the React application. `src/App.tsx` wraps the interface in `AppProvider`, which owns authentication and shared application state.
2. On startup, the provider restores any saved Supabase session and loads that user's profile. Until this check finishes, the application displays a loading message. Signed-out users see the sign-in and client-registration screen.
3. After sign-in, the provider loads the tenant's records. A new or cleared tenant starts with empty CRM collections; administrators can configure pipelines and stages.
4. The sidebar navigates between modules using URL hashes such as `#/leads`. The application checks the user's role before rendering each route; unauthorized routes show an access-restricted message.
5. Page components read and update shared state through `useApp()`. In a connected session, eligible changes are sent to Supabase after a short debounce. Save and load failures are shown in the application shell.

## Main areas

| Area | Purpose |
| --- | --- |
| Dashboard | Executive summary and lead, deal, and staff views, calculated from current tenant records. |
| Leads | Create and filter leads, and view them by funnel stage in a board or table. |
| Clients | Search client records, create clients, and keep client-related activities and quote notes. |
| Deals and Pipelines | Track deal value and probability; configure pipeline stages, move deals through stages, record stage history, and capture loss reasons. |
| Funnels | Summarize stage entries and conversions from recorded deal stage history. |
| Calendar | View renewal and other scheduled events. |
| Policy and finance | Quotation slips, invoices, payments, and the MIRA Form 1 reporting area. |
| Settings | Configure company, tax, email-template, and user-related settings for administrators. |

The navigation also includes plans, reports, documents, quotations, internal slips, payment requests, renewals, information requests, rate cards, targets, and the audit log. These routes currently display “Coming soon” placeholder screens rather than full workflows.

Quotes and deals can be recorded in MVR or USD. USD entry requires an editable per-form rate (MVR per USD); the form shows the MVR equivalent and saves the rate with the record. MVR amounts remain MVR. Cross-currency deal summaries are normalized to MVR using each deal's saved rate.

## Roles and access

The application uses four internal role keys, mapped to profile labels in Supabase:

| App role | Supabase profile role | Typical access |
| --- | --- | --- |
| `admin` | System Admin | All current modules, settings, user administration, and all supported record collections. |
| `sales` | Sales | Leads, deals, clients, calendar, pipelines, quotations, and sales workflows. |
| `finance` | Accountant | Dashboard, clients, invoices, payments, reports, funnels, and MIRA. |
| `client` | Client | Matched client details, documents, invoices, and payments. |

The route and navigation checks improve the user experience, but database permissions are enforced separately in the Supabase migration. Registration creates a Client profile; it does not let a registrant choose a staff role. An administrator provisions staff accounts through the `admin-create-user` Edge Function.

## Data and persistence

The shared client-side state includes leads, clients, activities, deals, invoices, payments, tax rates, pipelines and stages, stage-history entries, company settings, and email templates. The browser uses the Supabase URL and public anon key configured as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; authentication sessions persist in the browser.

CRM collections are stored as JSON records in the tenant-scoped `tenant_records` table. The app loads records for its configured tenant and saves each permitted collection through the `sync_tenant_records` RPC. That function validates the collection and record IDs, checks the caller's profile role, and synchronizes the collection. PostgreSQL row-level security restricts reads: staff roles can read tenant records, while clients can read only records associated with their profile email and matched client.

The current setup uses one fixed tenant ID in the frontend and database bootstrap. It is configured for a single tenant and is not yet a tenant-selection or tenant-provisioning system. Development can explicitly enable `VITE_AUTH_BYPASS=true`; this uses a local development administrator with empty in-memory records and skips remote persistence.

## Supabase components

- **`user_profiles`** associates each Supabase Auth user with a name, email, tenant, title, and role. A database trigger creates a Client profile for each newly registered auth user.
- **`tenant_records`** stores application records by tenant, resource name, and record ID.
- **`sync_tenant_records`** is the authenticated RPC used for role-checked record writes.
- **`admin-create-user`** verifies the caller's Supabase session and System Admin role, validates the submitted user details, creates the auth account with the service-role credential held by the function runtime, and assigns the requested profile.

The service-role key must stay in Supabase Edge Function secrets and must not be placed in a `VITE_*` variable or shipped to the browser.

## Current boundaries

- This is a frontend application; core CRM data access is through Supabase rather than a custom application server.
- Some navigation items are visual placeholders, and dashboard summary data includes fixed demonstration values.
- The top-bar search and notification controls are visual UI elements and do not currently perform search or notification workflows.
- Product and insurer catalogs are static reference options; tenant-specific CRM records are not initialized from bundled sample data.
- The latest database migration deletes all CRM records for the configured tenant while preserving Auth accounts and user profiles. Review the target before applying it.
- Setup steps for applying the database migration, promoting the initial administrator, and deploying the user-provisioning function are in [SUPABASE.md](./SUPABASE.md).

## Running locally

Install dependencies with `npm install`, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env` or `.env.local` file, and start the development server with `npm run dev`. On Vercel, `admin` can use the demo login endpoint configured with server-side `DEMO_ADMIN_USERNAME` and `DEMO_ADMIN_PASSWORD` variables. That mock session only grants access to an empty, browser-only demo UI; it does not access or persist Supabase CRM data and is not for production use. For local demos, `VITE_AUTH_BYPASS=true` and `VITE_DEMO_ADMIN_USERNAME`/`VITE_DEMO_ADMIN_PASSWORD` can enable the local-only bypass; `VITE_*` values are visible to browser users and should only contain disposable demo credentials. The project also provides `npm run build`, `npm run typecheck`, and `npm run lint`.
