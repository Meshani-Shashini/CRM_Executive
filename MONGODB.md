# Local MongoDB persistence

The Pipelines and Funnels module uses a local Node API so the MongoDB connection string remains server-side. Do not put MongoDB credentials in `VITE_*` variables or browser code.

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to the Atlas connection string, URL-encoding special characters in the username/password. Keep `.env` private; it is ignored by Git.
3. Ensure the Atlas network access list allows the development machine and the database user can read/write the selected database.
4. In one terminal run `npm run dev:api`; in another run `npm run dev`.

The API persists pipelines, stages, stage history, and deals in the `pipelines`, `pipeline_stages`, `stage_history_audit`, and `deals` collections in the configured database. Existing browser-local records are used to initialize an empty database. MongoDB is the shared source for this module after the API connects; if it is unavailable, the application reports the connection error and retains its local data.

This repository currently uses demo accounts selected in the browser, not authenticated user sessions. Accordingly, the API binds only to `127.0.0.1`, only accepts requests from the local Vite app, and refuses to start in production. Do not expose it or use it for multi-user production until real authentication, server-enforced role authorization, and tenant identity from trusted credentials are implemented.
