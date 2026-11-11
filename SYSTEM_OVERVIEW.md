# CRM Executive — System Overview

## 1. Purpose of the system

This project is a browser-based insurance brokerage CRM and sales operations platform. It manages lead intake, client records, lead-to-deal conversion, pipeline progression, financial records, user access, and operational activity tracking. The app is a React + TypeScript single-page application built with Vite and backed by Supabase for authentication and persistent tenant data.

From the code, the business domain is clearly insurance-focused and operationally sales-heavy. It supports multiple user roles, product and premium workflows, lead staging, communication validation, client onboarding, and downstream invoice/payment flows.

---

## 2. High-level architecture

### Frontend application layers
- `src/App.tsx` creates the shell, routes between modules, and determines page access by role.
- `src/store/AppContext.tsx` is the central application state provider that owns loading, persistence, authentication, and synchronization.
- `src/pages/*.tsx` contains each area of the business system (dashboard, leads, clients, deals, invoices, payments, settings, calendar, renewals, pipelines, funnels, etc.).
- `src/types.ts` defines the core business entities.
- `src/utils/*.ts` contains reusable business logic related to insurance pricing, communication validation, date handling, calendar/renewal derivation, lead lifecycle, staff formatting, and customer contact matching.

### Data and persistence model
The app stores most operational data in Supabase with a tenant-style record model. Records are synchronized through a generic `sync_tenant_records` RPC and are loaded into the application state. The system also has a local development demo mode with no remote persistence.

Key persisted collections include:
- leads
- clients
- activities
- deals
- quotation-requests
- client-quotations
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

### Recent UX and operational refinements
The system has recently been refined to present a more consistent broker-portal experience across modules. The most visible changes include:
- compact, responsive page toolbars and tighter spacing across the main operational views, especially Leads, Deals, Calendar, Renewals, Pipelines, Funnels, and QSlips.
- a calendar layout optimized to fit the viewport without clipping, with dense month/week/agenda navigation for sales teams working in narrow screens.
- a simplified pipelines board that uses single-row column layouts to improve scanning and reduce vertical crowding.
- unified page-header styling so Deals and Leads share the same layout patterns, while duplicate headings and redundant chrome were removed.
- standardised notifications and message treatment, including app-wide alerts for persistence issues and role-aware navigation feedback.
- improved dashboard/forecast value presentation with consistent currency formatting and cleaner KPI cards.
- a role-preview control in the sidebar so admins can review the experience as sales, finance, or client roles without leaving the current workspace.

These refinements are aimed at reducing visual noise, improving operational scan speed, and making the system behave as a single coherent CRM rather than a collection of standalone pages.

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
- `clientQuotations`
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
- `task`
- `quote` (used only for deal-linked insurer quote comparison records, not as a standalone client quote record)

Each activity includes a date, associated client/lead/deal, actor info, and often a title/description. Activities are used for both user actions and audit records.

### Deal
Deals represent already-qualified sales opportunities or bound placements. Every deal has a required lead link, and the runtime enforces that rule rather than backfilling orphan deals. Legacy import branches, legacy deal follow-up fields, and other orphan creation paths were removed so the supported flow is Lead -> Converted Deal -> Stage progression -> Deal-linked Quotation Request -> Client Quotation -> Won -> Invoice -> Payment.

### QuotationRequest
Quotation requests are persisted as `quotation-requests` tenant records and link an open deal, its lead and client, and one or more active insurers or reinsurers. They are created only from an eligible deal-driven workflow and record the required-by date, insured amount and currency, creator, and timestamps. Each request is a batch with a sequential yearly `QRS-YYYY-NNNN` reference and one ordered line per insurer/reinsurer; line references append a two-digit suffix and remain retired when cancelled. Line status drives the derived batch status, and each line carries its own response, premium, validity, terms, and status history. Creation and line status changes create activities linked to the source lead and deal.

### ClientQuotation
Client quotations are persisted as `client-quotations` tenant records. A quotation can only be created from a Quoted line in a deal-linked request; it carries a sequential yearly `QTY-YYYY-NNNN` reference and version number, source line, client addressee, risk/coverage terms, premium, validity, and acceptance details. Product-specific clause libraries, default validity, and the different-authorizer policy are configurable in Settings. Drafts are validated before issue; expiry is derived from `validUntil`, and revisions supersede the earlier version while retaining the same reference. Client acceptance advances the linked deal to its next open stage and records an activity. Won is gated on an accepted client quotation; invoice/payment processing follows the Won deal workflow. The document can be printed or saved as PDF; sending it by email is not implemented.

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

Administrators can configure target days for each active lead stage in Settings. Defaults are 3, 5, 5, 7, and 10 days in lifecycle order. Lead stage-entered timestamps are read from stage history and existing stage/date fields; the list and funnel show elapsed days and overdue status. These settings are tenant-record data and do not require a database migration.

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
The Lead and Deal inspection workspace combines events by linked `leadId` and `dealId` without copying them or falling back to client-wide activity. It also includes both records' stage histories, QRS creation/line status events, and QTY creation, issue, revision, and client-response events. Timeline entries are newest-first, identify their Lead, Deal, or Quotation origin and actor, can be filtered by event type, and avoid duplicating stage changes already represented in stage history.

Users can schedule an optional next activity with a type, due date, assignee, and note, then mark scheduled activities done. Optional activity due dates, completion flags, and assignee IDs are stored on the activity record, preserving compatibility with existing records. Lead and deal list, funnel, forecast, and pipeline indicators show overdue, due-today/no-activity, or future states. A stage move without an upcoming activity warns and can be continued unless an administrator enables the hard requirement in Settings.

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
Moving a commercial deal into Quotation / Underwriting prompts the user to create a quotation request when none is linked.
Every active deal pipeline uses the same fixed nine-stage sequence: Identified, Contact Made, Key Person Identified, Intro Mail, Meetings, Requirements Identified, Quotation / Underwriting, Quoted / Proposed, and Review and Follow up. Stage names and order are normalized for active pipelines; win/loss outcomes are stored separately from this open-stage sequence.

This makes the CRM useful both as a lead tracker and as a commercial pipeline performance tool.

The Funnels page also reports average and median days spent in each stage and between consecutive stages for the selected deal pipeline and the lead funnel. It counts distinct records currently beyond their configured stage target as stagnating.
Monthly deal summaries now separate closed-won value, open work in progress grouped by current pipeline stage with stage-probability-weighted values, and lost value. Dashboard Company/Deals, Funnels, and month/quarter Deals Forecast use the shared aggregation and eligibility rules. Records missing a valid expected close date, positive value, linked lead/client, or a required terminal outcome reason are excluded from totals and surfaced with validation details; stage progression enforces the open-deal requirements before a move is saved.

---

## 14. Financial modules

The broader system includes finance-related modules:
- invoices
- payments
- quotation request slips
- MIRA-style reporting surfaces

The implemented invoice and payment pages create and track financial records, update invoice payment status, show financial summaries, and export invoice or receipt data. A Quotation Request Slip is a deal-linked batch with one independently tracked line per insurer or reinsurer. Batch references use `QRS-YYYY-NNNN`; ordered line references append a two-digit suffix. Line status drives the derived batch status, and cancelled lines remain in place so their references are retired. The deal workspace compares insurer lines by premium, rate, and validity; QRS activity is linked to both the source lead and deal. A load-time normalizer converts legacy single-reference requests into lines. Client quotations use a distinct `QTY-YYYY-NNNN` reference and are created only from a Quoted QRS line; the QTY module supports drafting, product clause templates, issue, revision, client response, expiry, and print/save-PDF. QRS records are not a system for sending insurer emails or producing insurer quotation documents, and QTY does not send emails. The MIRA page currently provides a report layout and print/CSV controls, but its report rows are empty in the current implementation.

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
8. Sales moves the deal to Quotation / Underwriting and creates a QRS batch from the deal, with a separate line for each selected insurer/reinsurer.
9. A Quoted QRS line can seed a client quotation. Sales issues the validated QTY, and the client accepts or rejects it before the deal can be marked Won.
10. The Won deal creates the invoice; Finance records payments against that invoice.
11. Runtime audit history and activity notes track all major changes.

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

This is an insurance brokerage CRM with implemented lead, deal, client, vendor, pipeline, insurer quotation-request, client quotation, invoice, and payment workflows. The application connects authentication, role-aware navigation, business records, and audit/activity tracking in a React single-page application backed by Supabase. The shell has recently been tightened into a more uniform, compact, responsive layout with improved navigation, dashboard formatting, and pipeline/calendar scanning, while a limited number of placeholder routes remain. The Calendar and MIRA screens are still not yet connected to fully populated live event/report data; the module inventory below records these current limitations.

---

## 19. Functional module inventory

The route names below are hash routes (for example, `#/deals`). Access restrictions are applied in the application shell. Admin role preview changes the role used for navigation and selected page behavior; it is a UI preview, not a separate user account.
Placeholder routes remain valid, but appear only in the admin-only collapsed Coming soon sidebar group.

| Route | Access | Current function |
|---|---|---|
| `#/dashboard` | Admin, Sales, Finance | Company KPIs and financial totals, plus Leads, Deals, and Staff dashboard views. Metric links open the corresponding filtered module. |
| `#/plans` | Admin, Sales | Placeholder for personal sales plans and targets. |
| `#/leads` | Admin, Sales | Lead list, funnel/board, and forecast; search and filters; create/edit; lead inspection; lifecycle/stage changes; conversion to a linked deal; and protected deletion. |
| `#/deals` | Admin, Sales | Pipeline board, list, forecast, archive, deal inspection, search/filter/sort, stage changes, linked activity, QRS line comparison, QTY preparation, and record management. Deal Won is gated on an accepted client quotation; expired unaccepted quotations appear in deal health. Closed deals are included in pipeline and list views by default; the Archive view focuses on terminal deals. |
| `#/clients` | Admin, Sales, Finance, Client | Client search and profile/details; contact associations; activity logging; admin client management; and client self-profile editing. |
| `#/vendors` | Admin, Sales, Finance | Vendor search and filtering by type, country, and status; vendor creation/editing; admin deletion; vendor contact details; and linked-deal/request context. Finance is read-only. |
| `#/calendar` | Admin, Sales | Read-only calendar derived from scheduled activity due dates, deal/lead close dates, policy and renewal dates, lead/deal SLA deadlines, and issued client quotation validity dates. Supports month, week, and agenda views, mine/all, type, and pipeline filters, upcoming events, and linked-record navigation; phones use agenda view. |
| `#/reports` | Admin, Finance | Placeholder for custom brokerage reports. |
| `#/documents` | Admin, Sales, Finance, Client | Placeholder for policy documents, endorsements, and certificates. |
| `#/quotations` | Admin, Sales, Client | Client-facing QTY list and workflow. Admin/Sales create drafts only from Quoted QRS lines, edit terms and product clauses, issue, revise, print/save PDF, or record response status. Clients can view their quotations and accept/reject issued quotations; acceptance advances the linked deal. |
| `#/qslips` | Admin, Sales | Search and progress deal-linked quotation request batches and insurer/reinsurer lines; filter by line status/vendor/client; and record per-insurer premiums, rates, validity, response references, and decline reasons. New batches are launched from an eligible deal workspace. |
| `#/internal-slips` | Admin, Sales | Placeholder for internal underwriting slips and cover notes. |
| `#/invoices` | Admin, Finance, Client | Create, filter, inspect, print, and CSV-export invoices; show outstanding/overdue/collected totals; apply configured GST; and display invoice payment state. |
| `#/payments` | Admin, Finance, Client | Record payments against unpaid or partially paid invoices; categorize by premium/commission/fee; update invoice payment status; filter by type; view totals; and export receipt CSVs. |
| `#/pay-requests` | Admin, Finance | Placeholder for outbound payment requests. |
| `#/renewals` | Admin, Sales | Read-only renewal list for overdue policies and policies due within 120 days, grouped by T-90/T-60/T-30/T-15 milestones; combines renewal-pipeline deals with existing client, lead, and policy expiry dates and links to the related deal or lead. |
| `#/info-requests` | Admin, Sales | Placeholder for requests for additional underwriting information. |
| `#/rate-cards` | Admin, Sales | Placeholder for insurer commission and brokerage rate cards. Product brokerage rates are configured under Settings instead. |
| `#/settings` | Admin | Company details, tax/GST rates, product catalog, email-template text, QTY validity and authorizer policy, product clause libraries, user profiles/roles, and system/configuration audit history. |
| `#/funnels` | Admin, Sales, Finance | Stage-history analytics for a selected pipeline, including stage entry counts, inter-stage conversion, and won/lost totals. |
| `#/pipelines` | Admin, Sales | View and progress insurance pipeline deals; review stage health/intent; and, for admins, create pipelines and configure/reorder stages and SLAs. |
| `#/targets` | Admin | Placeholder for monthly and annual staff targets. |
| `#/audit-log` | Admin | Opens the Audit Trail tab in Settings. |
| `#/mira` | Admin, Finance | MIRA Form 1 report layout with date controls, print/save-PDF and CSV export controls. The current report row source is empty, so it does not yet produce populated regulatory data. |

### Dashboard views

- **Company** summarizes weighted deal pipeline, closed-won value, active leads, clients, invoice balances, payments, lead counts by insurance class/stage, recent activity, and monthly won/open/lost values.
- **Leads** provides lead-specific progress and SLA-oriented summaries.
- **Deals** provides deal pipeline/forecast-oriented summaries, including month-by-month won and open stage-weighted value with Won/Open/All filtering.
- **Staff** groups operational information by staff member.

Dashboard values are computed from records already loaded into application state; they are not a separate reporting or data warehouse service.

### Lead workflow

The Leads page supports list, funnel, and forecast views. Users can search, filter, open a lead inspection/workspace, create and edit records, set contact/client/product/owner/value and expected dates, and progress the lead through its lifecycle. The board supports drag-and-drop stage changes, with transition notes and lost reasons where required. Leads can only be moved to the terminal Converted state through the conversion action, which creates/links a deal rather than merely changing the lead stage. The system prevents a second conversion for an already-linked lead. Deletion is admin-only and protected when related deal/request records must be resolved.

### Deal and pipeline workflow

Deals can be viewed in:
- **Pipeline:** cards grouped by configured stage, sorted by activity, value, expected close, or creation date. Stage drag-and-drop uses the validated stage-change flow.
- **List:** searchable and sortable deal records with pipeline, owner, and additional-condition filters.
- **Forecast:** validated won/open/lost opportunities grouped by month or quarter with stage-probability-weighted open values and Won/Open/All filtering; users can move an open deal to a different expected-close period.
- **Archive:** closed deals with won/lost filtering and closed-stage context.

Stage changes write stage history and activity/audit entries. Open-deal progression requires a valid expected close date, positive value, and linked lead/client. Deals can be explicitly marked Won or Lost from the deal actions; these outcomes require a win or loss reason and do not add terminal stages to the fixed sequence. Marking a deal Won may create related invoice/renewal records. Deal deletion is restricted when invoices, leads, or quotation requests remain linked.

### Client, vendor, and contact functions

Client and vendor searches are performed against loaded records. Client profiles group organization, policy, account owner, insured-entity, and contact information, while client-linked activity remains part of the timeline. Client quotations cannot be created independently: each must originate from a Quoted line in a deal-linked QRS batch. Client users can view their own QTYs and respond to issued quotations; acceptance advances the deal through a dedicated database function. Client users can edit their own profile; admins manage client records. Vendor names are normalized to prevent duplicates, and email/phone fields are validated. Contact-profile helpers reconcile and link contacts across client, lead, and deal records.

### Quotation request and financial functions

Quotation requests require an eligible open deal linked to a lead and client, a product and positive insured value, at least one active insurer/reinsurer, and a required-by date. Requests receive sequential yearly batch references and store one independently tracked line per selected vendor; line references and status transitions are validated and audited.

Client quotations require a Quoted source line, validated addressee and risk details, positive premium and sum insured, future validity, and an authorizer distinct from the preparer when configured. Settings holds default validity and reusable product clause libraries. Issued QTYs can be revised, printed/saved to PDF, accepted or rejected by the linked client, and shown on the calendar through their validity date.

Invoices include line items, VAT, due dates, and installments. Payments are recorded against an invoice; the invoice is marked Partial or Paid based on the recorded total, and installments are marked paid when the invoice is fully settled. Invoice totals and financial dashboard summaries use their respective currency/VAT calculation helpers. CSV downloads are available for invoices and receipts.

### Administrative and configuration functions

Settings is admin-only and provides:
- Company legal/contact details.
- Tax-rate creation, editing, activation state, and deletion. Active standard rates are used by invoice creation.
- Product catalog management, including validation against existing lead/deal usage.
- Client quotation validity, authorizer policy, and reusable product-specific clauses.
- Editable email-template text; this does not itself send email.
- User profile/role management. Production user creation uses the `admin-create-user` Supabase Edge Function; registration through the login page creates client access.
- System/configuration audit entries for settings changes.

Pipeline configuration defines the fixed stage names/order and adjustable win probability and target/SLA days. The Deals/Pipelines pages use those definitions for stage presentation, health, forecasting, and transition validation.

---

## 20. Shared behavior and implementation boundaries

### Navigation, access, and persistence

- `App.tsx` maps hash routes to pages and checks the active role against a route access map. Unknown hashes return to the dashboard. Routes that are listed but not implemented render a descriptive placeholder.
- The shell tracks viewport/device information for responsive layout, provides mobile sidebar navigation, surfaces authentication/loading and persistence errors, and includes a sign-out control.
- `AppContext` owns the shared records and synchronizes permitted resources through Supabase. Writes are debounced and serialized; save errors are logged and surfaced in the shell. Admin can write all registered resources, Sales writes sales-domain records, and Finance writes invoices/payments. Client has no generic bulk-record write set; permitted self-profile updates and QTY acceptance/rejection use dedicated Supabase functions.
- The Supabase migrations define tenant records, user profiles/roles, permissions, workflow resources, and database functions. The `admin-create-user` Edge Function handles privileged user creation. Local auth bypass remains for development/testing, but the demo seed is intentionally neutral and does not create leads, deals, quotation requests, invoices, or payments; it only provides scaffolding for local UI testing. This preserves demo mode without seeding downstream business records.

### Cross-cutting business rules

- Contact and communication helpers validate/normalize email, phone, and Telegram details; stage configuration can require complete communication channels.
- Lead lifecycle and deal stage-history helpers hydrate, normalize, and derive transition timelines from current records without backfilling orphan deals.
- `nextActivity` derives the earliest pending due date strictly from scheduled activities associated with the lead or deal IDs; it no longer depends on legacy deal follow-up fields. `leadStageSla` resolves configurable targets and elapsed time from stage history and record dates, and `stageDuration` calculates elapsed and transition durations without customer-link fallbacks.
- Currency utilities parse/format MVR and USD amounts, apply exchange rates, and calculate MVR equivalents. Insurance utilities provide product brokerage calculations; invoice utilities compute VAT-inclusive totals.
- Hash query parameters support deep links and filters for selected routes, including lead/deal records, invoice/payment views, and quotation requests.
- Responsive table, date-input, modal, badge, owner, product, and stage controls are shared components. CSV downloads use a shared escaping/download helper.

### Current implementation limits

- Placeholder routes remain valid navigation stubs in the admin-only, collapsed Coming soon group; they do not yet provide the described business workflow.
- Calendar and renewal entries are derived from existing records at read time; neither module creates a separate event or renewal collection.
- MIRA's displayed rows are currently an empty array. Date inputs change the displayed period, but do not load or filter report records.
- The quotation-request page records and tracks requests; the app does not send insurer emails or ingest quotation responses automatically.
- Email-template settings store editable text but do not provide an email delivery service.
- Plans, reports, documents, internal slips, payment requests, info requests, rate cards, and targets remain placeholders and should not be treated as operational capabilities merely because their routes remain available.

## 21. Local development and validation

The project is a Vite React/TypeScript application. The package scripts provide:
- `npm run dev` — local development server.
- `npm run build` — production bundle.
- `npm run typecheck` — TypeScript app type-check.
- `npm run lint` — ESLint.
- `npm test` — Vitest tests under `src`.
- `npm run test:e2e` — Playwright browser tests.
- `npm run check:demo-seed` — demo-seed integrity check.

Normal operation requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. In local development, `VITE_AUTH_BYPASS=true` can enable auth bypass; `VITE_DEMO_SEED=true` loads a neutral in-memory scaffold for UI testing. Add `VITE_DEMO_LEADS=true` to that environment to load six validated sample leads and their linked organization profiles across the lead lifecycle; this flag also activates the scaffold. Neither demo mode seeds deals, quotation requests, invoices, or payments. The Playwright configuration starts the dev server with these test settings. Demo mode is not a production persistence mode.
