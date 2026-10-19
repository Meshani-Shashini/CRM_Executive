# MongoDB persistence and authentication

The Express API uses Mongoose to connect to MongoDB Atlas. Credentials and JWT signing secrets remain server-side; do not put them in `VITE_*` variables or browser code.

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to the Atlas connection string, URL-encoding special characters in the username/password. `.env` is ignored by Git.
3. Replace `JWT_SECRET` with a unique, cryptographically random value of at least 32 characters. Do not reuse the MongoDB password.
4. Ensure the Atlas network access list allows the API host and the database user can read/write the selected database.
5. To create the first System Admin, set `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` (12–72 bytes) and start the API. It creates the account only if no System Admin exists. Remove the bootstrap password from the runtime environment after setup.
6. Run `npm run dev`; it starts both the API and Vite frontend. If MongoDB/JWT configuration is missing, the frontend still starts and displays an actionable API-unavailable message. Alternatively, run `npm run dev:api` and `npm run dev:web` in separate terminals. A deployed frontend must be same-site with the API (the session cookie is `SameSite=Strict`). Set `APP_ORIGIN` to the exact frontend origin and deploy behind HTTPS.

Users have one of four database roles: `System Admin`, `Sales`, `Accountant`, or `Client`. Public registration creates Client accounts only. System Admins can provision staff accounts and assign a role from Settings. Passwords must be at least 12 characters and are hashed with bcrypt. Login issues an eight-hour HS256 JWT in an HttpOnly, SameSite=Strict cookie. Every protected request rechecks the user's account and current role in MongoDB.

The API persists pipelines, stages, stage history, and deals in the `pipelines`, `pipeline_stages`, `stage_history_audit`, and `deals` collections. Existing browser-local pipeline data initializes empty MongoDB collections. System Admin, Sales, and Accountant can view pipeline data; System Admin and Sales can update deals/history; only System Admin can change pipeline configuration or manage users. API operations are scoped to the authenticated user's tenant ID.

The rest of the demo CRM records still use browser storage. Configure one `MONGODB_TENANT_ID` for this deployment until tenant provisioning is added. Use HTTPS, a restricted MongoDB user/network allowlist, and an exact `APP_ORIGIN` in production. The UI also hides links by role, but server middleware is the enforcement boundary for API data.

For local UI development only, `VITE_AUTH_BYPASS=true` opens the app as a dummy System Admin and skips all authentication and pipeline API requests. In Vite development this is enabled by default unless the variable is explicitly set to `false`. The bypass is disabled in production builds. Set `VITE_AUTH_BYPASS=false` in `.env` to test authentication again. Do not treat the demo role as authenticated or use it to access protected API data.
