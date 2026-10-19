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

   **The newest migration deletes all `tenant_records` for the configured tenant.** This is intentionally destructive and preserves Auth users and `user_profiles`; review the target project before applying it.
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

## Data and access behavior

The app starts with empty CRM collections and does not seed sample clients, leads, deals, invoices, payments, activities, tax rates, or pipelines. Administrators can create pipelines and stages after signing in. Records are loaded from Supabase after sign-in and changes are saved through the role-checked RPC. Clients can only read their matched client, invoice, payment, and activity records. Sales and Accountants can read tenant records; writes are restricted to their permitted record collections. Only System Admins can change global settings or pipeline configuration.

The current application uses one fixed tenant UUID (`00000000-0000-4000-8000-000000000001`) for its deployment. Replace the tenant bootstrap/selection approach before using this setup for multiple separately provisioned tenants.
