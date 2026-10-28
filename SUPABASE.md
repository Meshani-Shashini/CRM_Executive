# Supabase setup

The browser uses Supabase Auth and the public anon key. CRM records are stored in the tenant-scoped `tenant_records` table through the `sync_tenant_records` RPC; profile rows are managed by the `user_profiles` auth trigger. Row-level security and role checks are enforced in PostgreSQL. The service-role key is used only by the `admin-create-user` Edge Function and must never be added to a `VITE_*` variable or browser bundle.

## Configure and apply the schema

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `.env` file.
2. Link the Supabase CLI to the intended project and apply the checked-in migrations:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   Migration `20261019020000_clear_demo_tenant_records.sql` deletes all `tenant_records` for the configured tenant. It is intentionally destructive and preserves Auth users and `user_profiles`. Review the target project before applying it. Migration `20261020070000_customer_account_lookups.sql` updates the record-sync permissions for saved customer lookup options; it does not clear existing records. Migration `20261020120000_client_profile_management.sql` links client logins to a unique matching client record and enables narrowly scoped contact updates from the Client Portal. It does not clear data. Client logins with no unique matching client email remain unlinked and cannot see client records until an administrator associates them. Only link an account after verifying the client identity, for example: `UPDATE public.user_profiles SET client_record_id = '<tenant_records.record_id>' WHERE id = '<verified auth user UUID>' AND role = 'Client';`. Migration `20261020140000_default_brokerage_pipeline.sql` seeds the six-stage Commercial Brokerage pipeline when no stages exist. Migration `20261020150000_commercial_pipeline_six_stages.sql` normalizes existing Commercial Brokerage stages to the six requested stages, remaps deal and stage-history references, and preserves Won/Lost outcomes. These pipeline migrations do not clear tenant data.

   If the cleanup migration is already recorded as applied, `db push` will not run it again. To clear records added since then, sign out of the app, confirm the Supabase project is the one configured for this app, then run this in that project's SQL Editor:

   ```sql
   DELETE FROM public.tenant_records
   WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
   ```

   This removes **all CRM collections** for the app's configured tenant, not just dashboard examples. Afterward, reopen the app and sign in so the dashboard fetches the empty collections.
3. Sign up the intended first administrator using the app. If email confirmation is enabled, confirm that address first.
4. In the Supabase SQL Editor, promote only that known account to System Admin:

   ```sql
   UPDATE public.user_profiles
   SET role = 'System Admin'
   WHERE lower(email) = lower('admin@example.com');
   ```

   Replace the email with the verified account address and confirm exactly one row was updated. Registration always creates Client profiles; users cannot grant themselves a staff role. Sign out and back in after promotion so the app reloads the new role.
5. Set the Edge Function secrets in Supabase (the service-role key must only be supplied to the function runtime), then deploy the administrator-only user provisioning function:

   ```powershell
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   npx supabase functions deploy admin-create-user
   ```

   Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the function runtime. Never use the service-role key as a frontend variable.
6. For normal authentication, set `VITE_ADMIN_LOGIN_EMAIL` in the ignored `.env` or `.env.local` file to the valid email address of the administrator account. The login form accepts `admin` as an alias for this email; Supabase still verifies the password.
7. For a **local-only demo**, the ignored `.env.local` may set `VITE_AUTH_BYPASS=true`, `VITE_DEMO_ADMIN_USERNAME=admin`, and `VITE_DEMO_ADMIN_PASSWORD` to a temporary password. This bypass is enabled only by Vite's development mode, skips remote persistence, and disables sign-up. `VITE_*` values are included in browser code, so use only disposable demo credentials and never enable this for a production build. In demo mode, Supabase URL/key configuration may be omitted.
8. Start the frontend with `npm run dev`. Without the local demo settings, normal Supabase authentication is used.

## Demo sample workspace and seed sample Leads

The local demo login (`VITE_AUTH_BYPASS=true`) loads an isolated in-memory UI fixture from `src/lib/sampleWorkspace.ts`: Leads and Deals using CF, SH, and TL, HOT/WARM/COLD temperatures, 12 contacts per client, stage history, and timestamped meetings, proposals, notes, and tasks. It also includes four paired Lead/Deal SLA cases: 5/14 days (Green), 11/12 days (Amber), 18/10 days (Red), and a just-started stage with a zero-day target (No SLA). The case label is included in each sample record's source and notes. Leads, Deals, and Activities record `createdAt`; Lead/Deal stage changes update `stageChangedAt`, and scheduled follow-up tasks record `nextActivityCreatedAt`. These timestamps drive the detail-view duration and timeline calculations. Pipeline administrators can configure each stage's target duration (SLA) in days; the detail view displays elapsed time and target progress. The fixture is loaded only by the local development demo login and is never written to Supabase.

For local development UI checks, append `?telemetry=healthy`, `?telemetry=warning`, or `?telemetry=overdue` to the app URL to simulate a stage duration at 50%, 85%, or 105% of its configured SLA. Alternatively, `?stageEnteredAt=<ISO-8601 timestamp>` overrides the selected record's stage-entry timestamp directly. These preview overrides are disabled outside Vite development mode and do not modify saved records.

The reusable `initializeSampleLeads` helper in `src/lib/sampleLeads.ts` creates eight realistic Maldives insurance-brokerage Leads across MVR and USD, then merges them into the authenticated tenant through `sync_tenant_records`. It preserves non-sample Leads and is safe to run repeatedly because the sample IDs are stable. From a component, `useApp().initializeSampleLeads()` also updates the in-memory Leads collection immediately; in normal mode the next tenant-records load hydrates the same collection from Supabase.

Call it from an authenticated development-only action or the browser console after importing the helper. Pass the IDs of real System Admin or Sales profiles from the current tenant:

```ts
import { initializeSampleLeads } from './src/lib/sampleLeads';

await initializeSampleLeads(['sales-profile-uuid', 'admin-profile-uuid']);
```

The helper does not create user profiles or client records; the supplied owner IDs must already exist, and the signed-in user must have permission to update Leads.

## Data and access behavior

Outside local demo mode, records are loaded from Supabase after sign-in and changes are saved through the role-checked RPC. After the pipeline migrations, Commercial Brokerage uses exactly six stages: Fact-Finding & Risk Survey (20%), Market Placement / Outender (40%), Quote Comparison & Presentation (60%), Underwriter Negotiation (80%), Policy Bound / won (100%), and Lost / Declined (0%). Won deals are confirmed at the bound stage; Lost/Declined requires a reason, and outcomes are stored explicitly for reporting. Administrators can also create multiple business-line pipelines from the available Commercial Property & Marine, Retail & Personal Lines, Annual Renewals, and Claims templates. Active client policies with an expiry date from today through three calendar months ahead are automatically added to an active Annual Renewals pipeline, once per client/expiry; successful renewals remain there as Won and prompt staff to proceed with invoicing and active sales follow-up. Client Portal access is keyed to `user_profiles.client_record_id`; the migration backfills that association only when a login email has exactly one matching client record. Clients can only read that linked client, invoice, payment, and activity records, and can update only their linked contact information through `update_own_client_contact`. Administrators can edit or delete client records and update user display name, job title, or role (not authentication email). Sales and Accountants can read tenant records; writes are restricted to their permitted record collections. Only System Admins can change global settings or pipeline configuration.

The current application uses one fixed tenant UUID (`00000000-0000-4000-8000-000000000001`) for its deployment. Replace the tenant bootstrap/selection approach before using this setup for multiple separately provisioned tenants.
