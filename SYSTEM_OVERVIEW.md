# CRM Executive — System Overview

## 1. Purpose of the system

This project is a browser-based insurance brokerage CRM and sales operations platform. It manages lead intake, client records, lead-to-deal conversion, pipeline progression, financial records, user access, and operational activity tracking. The app is a React + TypeScript single-page application built with Vite and backed by Supabase for authentication and persistent tenant data.

From the code, the business domain is clearly insurance-focused and operationally sales-heavy. It supports multiple user roles, product and premium workflows, lead staging, communication validation, client onboarding, and downstream invoice/payment flows.

---

## 2. High-level architecture

### Frontend application layers
- `src/App.tsx` creates the shell, routes between modules, and determines page access by role.
- `src/store/AppContext.tsx` is the central application state provider that owns loading, persistence, authentication, and synchronization.
- `src/pages/*.tsx` contains each area of the business system (dashboard, leads, clients, deals, invoices, payments, settings, calendar, pipelines, funnels, etc.).
- `src/types.ts` defines the core business entities.
- `src/utils/*.ts` contains reusable business logic related to insurance pricing, communication validation, date handling, lead lifecycle, staff formatting, and customer contact matching.

### Data and persistence model
The app stores most operational data in Supabase with a tenant-style record model. Records are synchronized through a generic `sync_tenant_records` RPC and are loaded into the application state. The system also has a local development demo mode with no remote persistence.

Key persisted collections include:
- leads
- clients
- activities
- deals
- invoices
- payments
- pipelines
- pipeline stages
- stage history
- tax rates
- company settings
- email templates
- customer lookup values
- products

---

## 3. User roles and permissions

The app defines four main roles:
- `admin`
- `sales`
- `finance`
- `client`

The shell uses an access map to decide which routes/modules are available to each user. Examples:
- admin: all workspaces
- sales: sales and lead/deal modules
- finance: finance and reporting surfaces
- client: narrower, client-facing data only

Role checks are enforced when rendering pages and when performing certain protected actions such as deleting leads or editing admin settings.

---

## 4. Authentication and session flow

### Normal mode
When `AUTH_BYPASS` is false, the app:
1. Checks the Supabase session using `supabase.auth.getSession()`.
2. Subscribes to `supabase.auth.onAuthStateChange()` for sign-in, sign-out, token refresh, and user update events.
3. Loads the user profile from `user_profiles` using the authenticated user ID.
4. Builds a `User` object containing role and metadata.
5. Allows the main shell to render the appropriate module.

If there is no authenticated user, the app shows the login flow. If the user profile cannot be loaded, an auth error is surfaced to the user.

### Demo mode
The code supports a development bypass (`AUTH_BYPASS`) when `VITE_AUTH_BYPASS=true` is set. In that mode:
- a demo admin session is created locally
- data stays in memory
- no remote Supabase persistence occurs
- authentication is effectively bypassed for UI testing

---

## 5. Application state and persistence

`AppProvider` owns all major application state. It initializes arrays including:
- `user`
- `leads`
- `clients`
- `activities`
- `vendors`
- `quotationRequests`
- `deals`
- `invoices`
- `payments`
- `users`
- `products`
- `pipelines`
- `pipelineStages`
- `stageHistory`
- `taxRates`
- `company`
- `emailTemplates`
- `customerLookups`

The app loads persisted tenant records using a generic record-loading workflow based on `resource` names, then pushes them into state.

### Save cycle
After data is ready and the user is authenticated, a debounced effect writes record sets back to Supabase. Role-based permissions determine which collections each user may write.

The save strategy is:
- collect all state data into `allResources`
- determine `writableByRole[user.role]`
- save only allowed resources
- queue writes with `saveQueue.current` to avoid race conditions
- display a `persistenceError` banner if a save fails

This makes the app behave like a centralized transactional CRM where the UI state is synchronized to the database without a separate backend service layer.

---

## 6. Core domain entities

### User
The `User` type includes:
- `id`
- `name`
- `email`
- `role`
- `title`
- optional `clientId`

### Lead
The `Lead` model represents a sales prospect or opportunity. It includes:
- person and contact information (`contact`, `contactEmail`, `contactPhone`, `whatsapp`, `telegram`)
- organization association (`client`, `clientId`)
- product and insurance metadata (`productCode`, `insuranceClass`, `country`)
- sales status (`temperature`, `status`, `funnelStage`)
- operational tracking (`ownerId`, `closeDate`, `renewalDate`, `dealId`, `pipelineId`)
- monetization fields (`value`, `valueMvr`, `currency`, `exchangeRate`, `premium`, `sumInsured`)
- notes and loss disposition (`notes`, `lossReason`, `disposition`)
- linked contacts and stage history

### Client
Client records capture the organization-level account. Fields include:
- name, country, phone, email, address, TIN
- contact person and contacts list
- product class and insurer metadata
- policy details (`sumInsured`, `premium`, `expiry`)
- tags and account status
- optional insured entity details for broader underwriting or compliance workflows

### CompanyContactProfile
This is a reusable contact structure. It tracks:
- `id`, `name`, `role`, `email`, `phone`, `whatsapp`, `telegram`
- `linkedLeadIds`, `linkedDealIds`

This allows the same contact to be associated with multiple leads or deals without duplicating the record everywhere.

### Activity
Activities are timeline entries created for operational events. Allowed types include:
- `call`
- `meeting`
- `email`
- `upload`
- `note`
- `quote`
- `task`

Each activity includes a date, associated client/lead/deal, actor info, and often a title/description. Activities are used for both user actions and audit records.

### Deal
Deals represent already-qualified sales opportunities or bound placements. Every deal has a required lead link; conversion, legacy imports, and renewal automation share the deal/lead linking helper. An idempotent migration and the AppContext load normalizer backfill legacy deals without a linked lead.

### QuotationRequest
Quotation requests are persisted as `quotation-requests` tenant records and link an open deal, its lead and client, and one or more active insurers or reinsurers. Each request records its required-by date, insured amount and currency, status, creator, and timestamps. Creation and status changes are added to the linked activity timeline.

### ProductCode
The product catalog includes fields like:
- `code`, `name`, `description`
- `category`, `classType`, `defaultPipelineCode`
- `standardBrokerageRatePct`
- `salesCycleVelocity`, `riskLevel`
- `keyUnderwritingIntakeArtifacts`

---

## 7. The lead management process

`LeadsPage.tsx` is the most central operational page in the system. It supports list, funnel, and forecast modes.

### Lead creation form
Creating a lead collects:
- organization or company selection
- person ownership and primary contact details
- additional contact profiles
- lead title, source, and notes
- product code
- expected close date
- lead owner
- currency and value
- lead temperature and lifecycle stage
- loss reason if needed

The system validates the data before saving:
- organization must exist or be created first
- primary contact name is required
- email format must be valid
- phone numbers must pass validation
- WhatsApp and Telegram values are validated if present
- duplicate contact emails are rejected
- the lead title and product details must be complete enough for the workflow

The lead creation flow merges contact profiles, updates client metadata, and creates a new lead record in state.

### Lead editing
Existing leads are reopened into the lead form with their current client/contact details restored. The system reconstructs the correct organization and profiles from:
- the lead itself
- the linked client record
- the company contact list
- linked profile metadata

This ensures that contact information is not lost during edits.

### Lead deletion rules
Delete protection is important in this system. The app prevents deletion when:
- the lead is linked to a deal
- it has an associated commercial relationship that must be resolved first

Admin-only deletion is enforced, and a confirmation step is used to avoid accidental removal.

### Board-stage lifecycle
The app uses a lead board lifecycle that includes stages such as:
- `Lead Identified`
- `Contact Made`
- `Key Person Identified`
- `Intro Email Sent`
- `Meetings Ongoing`
- `Lost`
- terminal outcomes tied to deal linkage or progression

There is also a linkage and lifecycle function that decides whether a lead is still active or terminal based on whether it is attached to a deal.

### Drag-and-drop pipeline movement
The funnel view supports drag-and-drop between lifecycle columns. When a lead is dropped onto a stage:
- the lead’s stage is updated
- transition metadata is persisted
- stage-change remarks may be saved as an activity note
- the lead moves visually through the board

---

## 8. Search, filtering, and operational analytics

The lead page provides search and filter capabilities:
- text search
- filter by temperature
- filter by stage
- filter by owner
- filter by lead ID
- filter by status
- filter by insurance class

Hash-based URL params are also supported, so filters can be persisted in the application URL. The UI also calculates key summary metrics such as:
- lead count
- hot lead count
- aggregate MVR value in selected board stages

This helps sales managers review pipeline volume and lead quality from a single screen.

---

## 9. Client and organization process

Clients are managed as the account-level record that groups business information and linked relationships. The app supports both selecting an existing organization and creating a new one. When a new organization is created:
- a generated client ID is assigned
- the organization record is inserted at the front of the client list
- it is tagged as incomplete until more information is filled in
- the creator becomes the owner

The system also tracks contact association between client records and lead/deal records so the same person can be connected to multiple business objects without duplication.

---

## 10. Contact profile synchronization and duplicate prevention

One of the app’s more advanced workflows is the contact matching system. It uses helpers such as:
- `findMatchingContactProfile`
- `linkContactProfile`
- `mergeContactProfiles`
- `normalizeContactNumber`
- `reconcileContactAssociations`

These utilities:
- normalize phone numbers
- normalize emails to predictable comparison forms
- match contacts by email, phone, or ID
- merge duplicate profile entries
- reconnect profiles to leads and deals
- preserve consistent client contact lists when data updates happen

This reduces duplicate customer records and keeps contact continuity across the sales pipeline.

---

## 11. Activity and audit tracking

The app records both normal user activity and structural change audits.

### Activity timeline
`activities` store timeline events such as meetings, calls, notes, emails, quotes, tasks, and uploads.

### Audit trail
The AppContext uses an effect to compare the previous and current state of leads, deals, and clients. When differences are detected, it creates audit-style activities such as:
- `Lead created`
- `Lead deleted`
- `Lead stage changed`
- `Lead temperature changed`
- `Deal updated`
- `Client contact updated`

These are prepended to the activity stream, creating a precise operational history that can be reviewed by admins and managers.

---

## 12. Deals and workspace process

When a lead is inspected, the app opens the `DealWorkspace` component. This acts as the deeper sales workspace where the user can:
- inspect lead details and contact association
- review deal linkage and conversion status
- edit or delete the lead
- move through related sales actions and activity

This link between lead and deal ensures the system keeps commercial opportunity data separate from the original prospect record, while still preserving traceability.

---

## 13. Pipelines, stages, and forecast logic

The app includes pipeline abstractions for multiple operational workflows. The system tracks:
- `pipelines`
- `pipelineStages`
- `stageHistory`
- `lead-stage-history`

The board logic is integrated with lead lifecycle stages and conversion value totals. Forecast-like summaries are used to show opportunity value and progression across board stages.
Moving a commercial deal into stage 2 prompts the user to create a quotation request when none is linked.
Commercial, SME Velocity, and Renewals stage templates store explicit won/lost and approval flags. Existing stages are normalized by pipeline code and stage order, while label-based terminal detection remains a compatibility fallback for older custom stages.

This makes the CRM useful both as a lead tracker and as a commercial pipeline performance tool.

---

## 14. Financial modules

The broader system includes finance-related modules:
- invoices
- payments
- quotation / slip-related operations
- MIRA-style reporting surfaces

These modules support a complete insurance brokerage process where:
- quotes can be generated
- invoices can be issued
- payments can be tracked
- outstanding balances matter
- commission and premium logic must remain aligned with currency rules

The app also includes utility functions for:
- currency parsing and formatting
- USD-to-MVR conversion
- brokerage calculations
- invoice-related operations

---

## 15. Currency and insurance valuation logic

The code explicitly handles multi-currency insurance transactions. It uses default conversion logic and supports display and storage of values in both:
- `MVR`
- `USD`

This is critical because the lead and deal records contain value, premium, and exchange-rate information. The currency utilities compute and display values while preserving the underlying insurance business logic.

---

## 16. End-to-end business flow

A normal operational flow in this system looks like this:

1. A user signs in and the app loads their role and tenant records.
2. The sales team opens the Leads module.
3. They choose or create an organization and add a lead with contact details and insurance information.
4. The app validates the communication profile and contact records.
5. The lead appears in the pipeline or board with a lifecycle stage, owner, product, and value.
6. Sales moves the lead through stages and adds notes/activity.
7. Once qualified, the lead is associated with a deal workspace.
8. The deal progresses through pricing, quote, and policy binding steps.
9. Finance records invoices and payments based on the bound policy.
10. Runtime audit history and activity notes track all major changes.

---

## 17. Operational assumptions in the current codebase

The current implementation assumes:
- role-based access is required
- sales teams drive the lead pipeline
- client onboarding is a first-class process
- lead and deal records remain linked across the system
- communication validation is mandatory for quality control
- insurance broker operations are multi-currency and product-centric
- activity and audit trails are essential for accountability
- Supabase is the persistence layer for the business system

---

## 18. Summary

This is a full CRM for an insurance brokerage operation, with the lead workflow at its center. The application connects user authentication, pipeline progression, client contact management, financial tracking, and operational auditing into a single React-based system. The `LeadsPage` is the primary process surface, but the wider architecture supports a complete lead-to-deal-to-finance lifecycle in a single tenant-aware platform.
