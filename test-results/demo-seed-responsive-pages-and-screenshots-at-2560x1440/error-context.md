# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-seed.spec.ts >> responsive pages and screenshots at 2560x1440
- Location: e2e\demo-seed.spec.ts:61:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('main')
Expected substring: "placement workspace"
Error: strict mode violation: locator('main') resolved to 2 elements:
    1) <main class="min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6 animate-fadeIn ">…</main> aka getByRole('main').filter({ hasText: 'Deals pipelineKanban stage' })
    2) <main class="glass min-h-[460px] min-w-0 overflow-y-auto rounded-2xl px-3 py-1.5 sm:px-4 sm:py-1.5 xl:min-h-0 ">…</main> aka getByRole('main').filter({ hasText: 'Deals pipelineKanban stage' }).getByRole('main')

Call log:
  - Expect "toContainText" locator('main') with timeout 10000ms
  - waiting for locator('main')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e6]:
      - generic [ref=e7]: DA
      - generic [ref=e8]:
        - generic [ref=e9]: Demo Administrator
        - generic [ref=e10]: System admin
    - navigation [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]: Broker Portal
        - generic [ref=e17]:
          - link "Dashboard" [ref=e18] [cursor=pointer]:
            - /url: "#/dashboard"
          - link "My Plan" [ref=e25] [cursor=pointer]:
            - /url: "#/plans"
          - link "Leads" [ref=e31] [cursor=pointer]:
            - /url: "#/leads"
          - link "Deals" [ref=e35] [cursor=pointer]:
            - /url: "#/deals"
          - link "Clients" [ref=e42] [cursor=pointer]:
            - /url: "#/clients"
          - link "Vendors" [ref=e49] [cursor=pointer]:
            - /url: "#/vendors"
          - link "Calendar" [ref=e54] [cursor=pointer]:
            - /url: "#/calendar"
          - link "Reports" [ref=e58] [cursor=pointer]:
            - /url: "#/reports"
          - link "Documents" [ref=e62] [cursor=pointer]:
            - /url: "#/documents"
      - generic [ref=e68]:
        - generic [ref=e69]: Policy Portal
        - generic [ref=e73]:
          - link "Quotation Slips" [ref=e74] [cursor=pointer]:
            - /url: "#/qslips"
          - link "Quotations" [ref=e79] [cursor=pointer]:
            - /url: "#/quotations"
          - link "Internal Slips" [ref=e84] [cursor=pointer]:
            - /url: "#/internal-slips"
          - link "Invoice" [ref=e90] [cursor=pointer]:
            - /url: "#/invoices"
          - link "Payments" [ref=e95] [cursor=pointer]:
            - /url: "#/payments"
          - link "Payment Requests" [ref=e99] [cursor=pointer]:
            - /url: "#/pay-requests"
          - link "Renewals" [ref=e104] [cursor=pointer]:
            - /url: "#/renewals"
          - link "Info Requests" [ref=e111] [cursor=pointer]:
            - /url: "#/info-requests"
          - link "Rate Cards" [ref=e115] [cursor=pointer]:
            - /url: "#/rate-cards"
      - generic [ref=e121]:
        - generic [ref=e122]:
          - text: Admin Portal
          - generic [ref=e125]: Restricted
        - generic [ref=e129]:
          - link "Settings" [ref=e130] [cursor=pointer]:
            - /url: "#/settings"
          - link "Funnels" [ref=e135] [cursor=pointer]:
            - /url: "#/funnels"
          - link "Pipelines" [ref=e139] [cursor=pointer]:
            - /url: "#/pipelines"
    - generic [ref=e144]:
      - group "Preview role" [ref=e145]:
        - button "Admin" [pressed] [ref=e146] [cursor=pointer]
        - button "Sales" [ref=e147] [cursor=pointer]
        - button "Finance" [ref=e148] [cursor=pointer]
        - button "Client" [ref=e149] [cursor=pointer]
      - button "Sign out" [ref=e150] [cursor=pointer]
  - generic [ref=e154]:
    - banner [ref=e155]:
      - generic [ref=e156]:
        - heading "Deals" [level=1] [ref=e158]
        - generic [ref=e159]:
          - combobox "Search clients, leads, invoices…" [ref=e163]
          - generic [ref=e164]: ⌘K
        - button "Notifications, 3 unread" [ref=e166] [cursor=pointer]:
          - generic [ref=e170]: "3"
        - button "Account menu for Demo Administrator" [ref=e172] [cursor=pointer]:
          - generic [ref=e173]: DA
          - generic [ref=e174]:
            - generic [ref=e175]: Demo Administrator
            - generic [ref=e176]: Development Demo Session
    - main [ref=e179]:
      - generic [ref=e180]:
        - generic [ref=e181]:
          - generic [ref=e182]:
            - heading "Deals pipeline" [level=1] [ref=e183]
            - paragraph [ref=e184]: Kanban stage progression, validation, activity timeline, and placement inspection.
          - generic [ref=e185]:
            - generic [ref=e186]:
              - generic [ref=e187]: Open deals
              - generic [ref=e188]: "5"
            - button "Filter" [ref=e189] [cursor=pointer]
            - button "+ Legacy deal" [ref=e192] [cursor=pointer]
        - generic [ref=e194]:
          - complementary [ref=e195]:
            - generic [ref=e196]:
              - generic [ref=e198]:
                - heading "Deals & Leads" [level=2] [ref=e199]
                - paragraph [ref=e200]: 10 records
              - textbox "Search deals and leads" [ref=e201]:
                - /placeholder: Search client, product, stage…
              - combobox "Filter by product" [ref=e202]:
                - option "All products" [selected]
                - option "AB · Advance Bond"
                - option "BB · Bid Bond"
                - option "CB · Performance Bond"
                - option "CM · Comprehensive Machinery"
                - option "CP · Electronic Equipment"
                - option "CR · Computer Crime"
                - option "FZ · Contractor's Plant & Machinery"
                - option "IR · Industrial All Risks (Engineering)"
                - option "LM · Machinery Con Loss"
                - option "NC · Contractors All Risks"
                - option "NE · Erection All Risks"
                - option "NM · Machinery Breakdown"
                - option "CF · Commercial Fire"
                - option "DF · Dwelling Fire"
                - option "FIR · Industrial All Risks (Fire)"
                - option "FY · Terrorism and Sabotage"
                - option "HC · Hotel Combine"
                - option "LP · Consequential Loss"
                - option "PR · Property All Risk"
                - option "EC · Export Certificate"
                - option "EP · Export Policy"
                - option "IC · Import Certificate"
                - option "IP · Import Policy"
                - option "LC · Land Cover"
                - option "LT · Land Transit"
                - option "OP · Open Policy"
                - option "RJ · Rejection Cover"
                - option "SH · Hull Policy"
                - option "ZZ · Special Marine Policy"
                - option "AL · Airport Owners & Operators Liability"
                - option "AP · Personal Accident"
                - option "BL · Bankers Indemnity"
                - option "CG · Fidelity Guarantee"
                - option "CT · Travelclasics"
                - option "DL · Doctors Liability"
                - option "DO · Directors & Officers Liability"
                - option "EL · Workmen's Compensation"
                - option "FL · Freight Forwarders Liability"
                - option "GL · Plate Glass Insurance"
                - option "GT · Goods in Transit"
                - option "HB · Burglary & Housebreaking"
                - option "HE · Surgical and Hospital Expenses"
                - option "HR · Hull All Risk"
                - option "MR · All Risks"
                - option "MT · Money in Transit"
                - option "PL · Product Liability"
                - option "PN · Professional Indemnity Insurance"
                - option "SI · Suwa Sampatha International"
                - option "TL · Public Liability"
            - generic [ref=e203]:
              - button "Bonavista Maldives Contractors All Risks deal NC Market Tender & Placing Slip Submission SLA overdue MVR 500,000.00" [ref=e204] [cursor=pointer]:
                - generic [ref=e205]:
                  - generic [ref=e206]:
                    - generic [ref=e207]: Bonavista Maldives
                    - generic [ref=e208]: Contractors All Risks
                  - generic [ref=e209]: deal
                - generic [ref=e210]:
                  - generic [ref=e211]: NC
                  - generic [ref=e212]: Market Tender & Placing Slip Submission
                  - generic [ref=e213]: SLA overdue
                - generic [ref=e217]: MVR 500,000.00
              - button "Atoll Trading Property All Risk deal PR Comparative Analysis & Presentation USD 320,000.00" [ref=e218] [cursor=pointer]:
                - generic [ref=e219]:
                  - generic [ref=e220]:
                    - generic [ref=e221]: Atoll Trading
                    - generic [ref=e222]: Property All Risk
                  - generic [ref=e223]: deal
                - generic [ref=e224]:
                  - generic [ref=e225]: PR
                  - generic [ref=e226]: Comparative Analysis & Presentation
                - generic [ref=e227]: USD 320,000.00
              - button "Bonavista Maldives Bonavista Maldives - Contractors All Risks lead NC Converted to deal SLA overdue MVR 250,000.00" [ref=e228] [cursor=pointer]:
                - generic [ref=e229]:
                  - generic [ref=e230]:
                    - generic [ref=e231]: Bonavista Maldives
                    - generic [ref=e232]: Bonavista Maldives - Contractors All Risks
                  - generic [ref=e233]: lead
                - generic [ref=e234]:
                  - generic [ref=e235]: NC
                  - generic [ref=e236]: Converted to deal
                  - generic [ref=e237]: SLA overdue
                - generic [ref=e241]: MVR 250,000.00
              - button "Bonavista Maldives Atoll Trading Property Renewal lead NC Converted to deal USD 285,000.00" [ref=e242] [cursor=pointer]:
                - generic [ref=e243]:
                  - generic [ref=e244]:
                    - generic [ref=e245]: Bonavista Maldives
                    - generic [ref=e246]: Atoll Trading Property Renewal
                  - generic [ref=e247]: lead
                - generic [ref=e248]:
                  - generic [ref=e249]: NC
                  - generic [ref=e250]: Converted to deal
                - generic [ref=e251]: USD 285,000.00
              - button "Atoll Trading Lagoon Resort Fire Cover lead PR Converted to deal MVR 320,000.00" [ref=e252] [cursor=pointer]:
                - generic [ref=e253]:
                  - generic [ref=e254]:
                    - generic [ref=e255]: Atoll Trading
                    - generic [ref=e256]: Lagoon Resort Fire Cover
                  - generic [ref=e257]: lead
                - generic [ref=e258]:
                  - generic [ref=e259]: PR
                  - generic [ref=e260]: Converted to deal
                - generic [ref=e261]: MVR 320,000.00
              - button "Atoll Trading Coral Construction Machinery Cover lead PR Converted to deal USD 355,000.00" [ref=e262] [cursor=pointer]:
                - generic [ref=e263]:
                  - generic [ref=e264]:
                    - generic [ref=e265]: Atoll Trading
                    - generic [ref=e266]: Coral Construction Machinery Cover
                  - generic [ref=e267]: lead
                - generic [ref=e268]:
                  - generic [ref=e269]: PR
                  - generic [ref=e270]: Converted to deal
                - generic [ref=e271]: USD 355,000.00
              - button "Lagoon Resorts Male Retail Package lead DF Converted to deal MVR 390,000.00" [ref=e272] [cursor=pointer]:
                - generic [ref=e273]:
                  - generic [ref=e274]:
                    - generic [ref=e275]: Lagoon Resorts
                    - generic [ref=e276]: Male Retail Package
                  - generic [ref=e277]: lead
                - generic [ref=e278]:
                  - generic [ref=e279]: DF
                  - generic [ref=e280]: Converted to deal
                - generic [ref=e281]: MVR 390,000.00
              - button "Lagoon Resorts North Harbour Cargo Cover lead DF Meetings Ongoing USD 425,000.00" [ref=e282] [cursor=pointer]:
                - generic [ref=e283]:
                  - generic [ref=e284]:
                    - generic [ref=e285]: Lagoon Resorts
                    - generic [ref=e286]: North Harbour Cargo Cover
                  - generic [ref=e287]: lead
                - generic [ref=e288]:
                  - generic [ref=e289]: DF
                  - generic [ref=e290]: Meetings Ongoing
                - generic [ref=e291]: USD 425,000.00
              - button "Coral Construction South Atoll Liability Review lead CM Meetings Ongoing MVR 460,000.00" [ref=e292] [cursor=pointer]:
                - generic [ref=e293]:
                  - generic [ref=e294]:
                    - generic [ref=e295]: Coral Construction
                    - generic [ref=e296]: South Atoll Liability Review
                  - generic [ref=e297]: lead
                - generic [ref=e298]:
                  - generic [ref=e299]: CM
                  - generic [ref=e300]: Meetings Ongoing
                - generic [ref=e301]: MVR 460,000.00
              - button "Coral Construction Island Engineering Survey lead CM Meetings Ongoing MVR 495,000.00" [ref=e302] [cursor=pointer]:
                - generic [ref=e303]:
                  - generic [ref=e304]:
                    - generic [ref=e305]: Coral Construction
                    - generic [ref=e306]: Island Engineering Survey
                  - generic [ref=e307]: lead
                - generic [ref=e308]:
                  - generic [ref=e309]: CM
                  - generic [ref=e310]: Meetings Ongoing
                - generic [ref=e311]: MVR 495,000.00
          - main [ref=e312]:
            - generic [ref=e313]:
              - generic [ref=e319]:
                - generic [ref=e320]:
                  - heading "Bonavista Maldives" [level=1] [ref=e321]
                  - generic [ref=e322]: Deal
                  - generic [ref=e323]: Market Tender & Placing Slip Submission
                - generic [ref=e324]:
                  - generic [ref=e325]: Contractors All Risks · Commercial Lines Brokerage · Ref demo-deal-1
                  - button "Open linked lead · Bonavista Maldives - Contractors All Risks" [ref=e326] [cursor=pointer]
              - generic [ref=e327]:
                - tablist "Deal workspace views" [ref=e328]:
                  - tab "Kanban view" [ref=e329] [cursor=pointer]
                  - tab "Inspection view" [selected] [ref=e332] [cursor=pointer]
                - button "Edit deal" [ref=e334] [cursor=pointer]
                - button "Delete deal" [disabled] [ref=e338]
            - region "Placement telemetry stage tracker" [ref=e342]:
              - heading "Placement telemetry" [level=2] [ref=e343]
              - list [ref=e345]:
                - listitem [ref=e346]:
                  - button "Fact-Finding & Risk Survey; entered 12-Oct-2026; stage duration 25d; completed" [ref=e347] [cursor=pointer]:
                    - generic [ref=e348]: 12-Oct-2026
                    - generic [ref=e349]: Fact-Finding & Risk Survey
                  - generic [ref=e353]:
                    - generic "25d; transitioned 12-Oct-2026 from Fact-Finding & Risk Survey to Market Tender & Placing Slip Submission":
                      - text: 25d
                      - generic: 12-Oct-2026
                - listitem [ref=e354]:
                  - button "Market Tender & Placing Slip Submission; entered 12-Oct-2026; stage duration 25d; elapsed 25d; SLA overdue, target 14 days" [disabled] [ref=e355]:
                    - generic [ref=e356]: 12-Oct-2026
                    - generic [ref=e357]: Market Tender & Placing Slip Submission
                  - generic [ref=e360]:
                    - text: 25d
                    - generic [ref=e361]: · 25d
                - listitem [ref=e363]:
                  - button "Comparative Analysis & Presentation; upcoming" [ref=e364] [cursor=pointer]:
                    - generic [ref=e365]: Comparative Analysis & Presentation
                - listitem [ref=e369]:
                  - button "Underwriter Negotiation & Structuring; upcoming" [ref=e370] [cursor=pointer]:
                    - generic [ref=e371]: Underwriter Negotiation & Structuring
                - listitem [ref=e375]:
                  - button "Policy Bound / Won; upcoming" [ref=e376] [cursor=pointer]:
                    - generic [ref=e377]: Policy Bound / Won
                - listitem [ref=e381]:
                  - button "Lost / Market Declined; upcoming" [ref=e382] [cursor=pointer]:
                    - generic [ref=e383]: Lost / Market Declined
            - region "Lead 360" [ref=e386]:
              - heading "Lead 360 · Lead → Deal → Quotation Requests" [level=2] [ref=e387]
              - generic [ref=e388]:
                - generic [ref=e389]:
                  - generic [ref=e390]: Lead
                  - button "Bonavista Maldives - Contractors All Risks" [ref=e391] [cursor=pointer]
                - generic [ref=e392]:
                  - generic [ref=e393]: Deal
                  - button "Bonavista Maldives · Contractors All Risks" [ref=e394] [cursor=pointer]
                - generic [ref=e395]:
                  - generic [ref=e396]: Quotation Requests
                  - link "QR-2026-0001 Draft" [ref=e398] [cursor=pointer]:
                    - /url: "#/qslips?requestId=demo-qr-1"
                    - generic [ref=e399]: QR-2026-0001
                    - generic [ref=e400]: Draft
            - generic [ref=e401]:
              - generic [ref=e402]:
                - heading "Client & Contact Details" [level=2] [ref=e403]
                - generic [ref=e404]:
                  - generic [ref=e405]:
                    - generic [ref=e406]: Client
                    - generic [ref=e407]: Bonavista Maldives
                  - generic [ref=e408]:
                    - generic [ref=e409]: Identification
                    - generic [ref=e410]: TIN-DEMO-1
                  - generic [ref=e411]:
                    - generic [ref=e412]: Address
                    - generic [ref=e413]: Demo address 1, Male
                  - generic [ref=e414]:
                    - generic [ref=e415]: Country
                    - generic [ref=e416]: Maldives
                  - generic [ref=e417]:
                    - generic [ref=e418]: Client email
                    - generic [ref=e419]: client1@example.test
                  - generic [ref=e420]:
                    - generic [ref=e421]: Client phone
                    - generic [ref=e422]: +960 7770011
                - region "Customer contacts" [ref=e423]:
                  - heading "Contacts 1" [level=3] [ref=e426]
                  - generic [ref=e428]:
                    - generic [ref=e429]:
                      - term [ref=e430]: Name
                      - term [ref=e431]: Email
                      - term [ref=e432]: Phone
                      - term [ref=e433]: WhatsApp
                      - term [ref=e434]: Telegram
                      - term [ref=e435]:
                        - generic [ref=e436]: Edit
                    - article [ref=e438]:
                      - generic "Contact 1 · Decision Maker" [ref=e439]:
                        - generic [ref=e440]: Contact 1
                        - generic [ref=e441]: Decision Maker
                        - generic [ref=e442]: Primary
                      - generic "client1@example.test" [ref=e443]
                      - generic "+960 7770011" [ref=e444]
                      - generic "+960 7770011" [ref=e445]
                      - generic "@demoContact1" [ref=e446]
                      - button "Edit Contact 1" [ref=e447] [cursor=pointer]
                - generic [ref=e451]:
                  - heading "Update communication channels" [level=3] [ref=e452]
                  - generic [ref=e453]:
                    - textbox "Contact name" [ref=e454]: Contact 1
                    - textbox "Phone" [ref=e455]:
                      - /placeholder: Phone *
                      - text: +960 7770011
                    - textbox "WhatsApp" [ref=e456]:
                      - /placeholder: WhatsApp *
                      - text: +960 7770011
                    - textbox "Telegram" [ref=e457]:
                      - /placeholder: Telegram / @username *
                      - text: "@demoContact1"
                  - button "Save contact channels" [ref=e458] [cursor=pointer]
              - generic [ref=e461]:
                - heading "Policy Details" [level=2] [ref=e462]
                - generic [ref=e466]:
                  - generic [ref=e467]:
                    - generic [ref=e468]: Insurance Type
                    - generic [ref=e469]: Contractors All Risks
                  - generic [ref=e470]:
                    - generic [ref=e471]: Current Insurer
                    - generic [ref=e472]: Allied Insurance
                  - generic [ref=e473]:
                    - generic [ref=e474]: Sum Insured
                    - generic [ref=e475]: MVR 300,000.00
                  - generic [ref=e476]:
                    - generic [ref=e477]: Premium
                    - generic [ref=e478]: MVR 15,000.00
                  - generic [ref=e479]:
                    - generic [ref=e480]: Probability
                    - generic [ref=e481]: 40%
                  - generic [ref=e482]:
                    - generic [ref=e483]: Expected Close
                    - generic [ref=e484]: 06-Dec-2026
                  - generic [ref=e485]:
                    - generic [ref=e486]: Policy Expiry
                    - generic [ref=e487]: 07-Mar-2027
                  - generic [ref=e488]:
                    - generic [ref=e489]: Owner / Representative
                    - generic [ref=e490]: Demo Administrator
                - generic [ref=e491]:
                  - generic [ref=e492]:
                    - generic [ref=e493]:
                      - generic [ref=e494]: NC · Contractors All Risks
                      - generic [ref=e495]: Engineering · PROPERTY · 14–30 Days cycle
                    - generic [ref=e496]: High risk
                  - generic [ref=e497]: "Underwriting intake: Contract award letter, Bill of Quantities (BOQ), project programme"
            - generic [ref=e498]:
              - generic [ref=e499]:
                - generic [ref=e500]:
                  - heading "Activity" [level=2] [ref=e501]
                  - paragraph [ref=e505]: Stage movement and client touchpoints.
                - generic [ref=e506]:
                  - button "Appointment" [ref=e507] [cursor=pointer]
                  - button "Proposal" [ref=e510] [cursor=pointer]
                  - button "Note" [ref=e514] [cursor=pointer]
                  - button "Task" [ref=e516] [cursor=pointer]
              - group "Filter timeline entries" [ref=e519]:
                - button "All" [pressed] [ref=e520] [cursor=pointer]
                - button "Stage changes" [ref=e521] [cursor=pointer]
                - button "Temperature" [ref=e522] [cursor=pointer]
                - button "Activity" [ref=e523] [cursor=pointer]
                - button "Appointments" [ref=e524] [cursor=pointer]
                - button "Proposals" [ref=e525] [cursor=pointer]
                - button "Notes" [ref=e526] [cursor=pointer]
                - button "Tasks" [ref=e527] [cursor=pointer]
              - region "Activity timeline" [ref=e528]:
                - generic [ref=e529]:
                  - article [ref=e530]:
                    - time [ref=e531]: 17-Sep-2026 23:30
                    - generic [ref=e534]:
                      - generic "Deal created" [ref=e535]
                      - generic "Contractors All Risks · Market Tender & Placing Slip Submission" [ref=e536]
                  - article [ref=e537]:
                    - time [ref=e538]: 12-Oct-2026 23:30
                    - 'generic "Stage: Market Tender & Placing Slip Submission" [ref=e542]'
                  - article [ref=e543]:
                    - time [ref=e544]: 06-Nov-2026 23:30
                    - generic [ref=e547]:
                      - generic "Demo seed" [ref=e548]
                      - generic "Local-only data for browser QA. · By Demo Administrator" [ref=e549]
            - generic [ref=e550]:
              - generic [ref=e551]:
                - heading "Compliance alerts" [level=2] [ref=e552]
                - generic [ref=e556]:
                  - paragraph [ref=e557]: Communication details are complete.
                  - paragraph [ref=e560]: "Required intake: Contract award letter, Bill of Quantities (BOQ), project programme"
                  - paragraph [ref=e561]: This stage exceeded its 14-day target SLA.
              - generic [ref=e564]:
                - generic [ref=e565]:
                  - heading "Quotes comparison" [level=2] [ref=e566]
                  - button "Quote" [ref=e570] [cursor=pointer]
                - paragraph [ref=e572]: No insurer quotes recorded. Add quotes to compare premium and terms.
              - generic [ref=e573]:
                - heading "Binding actions" [level=2] [ref=e574]
                - generic [ref=e575]:
                  - button "Add quote" [ref=e576] [cursor=pointer]
                  - button "Bind policy" [ref=e580] [cursor=pointer]
```

# Test source

```ts
  43  |     }
  44  |   }
  45  | }
  46  | 
  47  | async function takeViewportScreenshot(page: Page, name: string) {
  48  |   await page.screenshot({
  49  |     path: path.join(screenshotsDirectory, `${name}.png`),
  50  |     fullPage: true,
  51  |     animations: 'disabled',
  52  |   });
  53  | }
  54  | 
  55  | test.beforeAll(() => {
  56  |   mkdirSync(screenshotsDirectory, { recursive: true });
  57  | });
  58  | 
  59  | for (const viewport of viewports) {
  60  |   const sizeLabel = `${viewport.width}x${viewport.height}`;
  61  |   test(`responsive pages and screenshots at ${sizeLabel}`, async ({ page }) => {
  62  |     await page.setViewportSize(viewport);
  63  | 
  64  |     await page.goto('/#/leads');
  65  |     await expect(page.getByRole('table', { name: 'Leads' })).toBeVisible();
  66  |     await expect(page.getByText('Bonavista Maldives - Contractors All Risks', { exact: true }).first()).toBeVisible();
  67  |     await assertTableFields(page);
  68  |     await assertNoHorizontalOverflow(page);
  69  |     await takeViewportScreenshot(page, `leads-${sizeLabel}`);
  70  | 
  71  |     await page.goto('/#/deals');
  72  |     const tabs = page.getByRole('tablist', { name: 'Deal workspace views' }).getByRole('tab');
  73  |     await expect(tabs).toHaveText(['List', 'Kanban', 'Inspection']);
  74  |     await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  75  |     await assertTableFields(page);
  76  |     await assertNoHorizontalOverflow(page);
  77  |     await takeViewportScreenshot(page, `deals-list-${sizeLabel}`);
  78  | 
  79  |     const firstDeal = page.getByRole('link', { name: /^Open deal details for/ }).first();
  80  |     const stageSelect = firstDeal.getByRole('combobox', { name: /^Change stage for/ });
  81  |     const stageTypography = await stageSelect.evaluate((select) => {
  82  |       const stageCell = select.closest('td');
  83  |       return {
  84  |         select: getComputedStyle(select).fontSize,
  85  |         neighboringCell: getComputedStyle(stageCell?.previousElementSibling ?? select).fontSize,
  86  |         title: select.getAttribute('title'),
  87  |         selectedStage: select.selectedOptions[0]?.textContent,
  88  |       };
  89  |     });
  90  |     expect(stageTypography.select).toBe(stageTypography.neighboringCell);
  91  |     expect(stageTypography.title).toBe(stageTypography.selectedStage);
  92  | 
  93  |     const dealActionsButton = firstDeal.getByRole('button', { name: /^Actions for/ });
  94  |     await dealActionsButton.click();
  95  |     const dealActionsMenu = page.getByRole('menu', { name: /^Deal actions for/ });
  96  |     const deleteDealItem = dealActionsMenu.getByRole('menuitem', { name: 'Delete deal' });
  97  |     await expect(deleteDealItem).toBeVisible();
  98  |     await expect(deleteDealItem).toHaveCSS('white-space', 'nowrap');
  99  |     await expect(deleteDealItem).toHaveCSS('overflow-wrap', 'normal');
  100 |     await expect(deleteDealItem).toHaveCSS('word-break', 'normal');
  101 |     const menuBounds = await dealActionsMenu.evaluate((menu) => {
  102 |       const bounds = menu.getBoundingClientRect();
  103 |       return {
  104 |         top: bounds.top,
  105 |         left: bounds.left,
  106 |         right: bounds.right,
  107 |         bottom: bounds.bottom,
  108 |         viewportWidth: window.innerWidth,
  109 |         viewportHeight: window.innerHeight,
  110 |         isPortaled: menu.parentElement === document.body,
  111 |       };
  112 |     });
  113 |     expect(menuBounds.isPortaled).toBe(true);
  114 |     expect(menuBounds.left).toBeGreaterThanOrEqual(0);
  115 |     expect(menuBounds.top).toBeGreaterThanOrEqual(0);
  116 |     expect(menuBounds.right).toBeLessThanOrEqual(menuBounds.viewportWidth);
  117 |     expect(menuBounds.bottom).toBeLessThanOrEqual(menuBounds.viewportHeight);
  118 |     await assertNoHorizontalOverflow(page);
  119 |     await dealActionsButton.click();
  120 | 
  121 |     await tabs.nth(1).click();
  122 |     const pipelineSelect = page.getByLabel('Select deal pipeline');
  123 |     await pipelineSelect.selectOption({ label: 'Commercial Lines Brokerage' });
  124 |     const board = page.locator('.deals-fit');
  125 |     const boardWidth = await board.evaluate((element) => element.clientWidth);
  126 |     const expectedColumns = boardWidth < 640 ? 1 : boardWidth < 1000 ? 3 : 6;
  127 |     await expect(page.locator('.deals-board > section')).toHaveCount(6);
  128 |     await expect.poll(() => page.locator('.deals-board').evaluate((element) =>
  129 |       getComputedStyle(element).gridTemplateColumns.split(' ').length,
  130 |     )).toBe(expectedColumns);
  131 |     for (const stage of [
  132 |       'Fact-Finding & Risk Survey',
  133 |       'Market Tender & Placing Slip Submission',
  134 |       'Comparative Analysis & Presentation',
  135 |       'Underwriter Negotiation & Structuring',
  136 |       'Policy Bound / Won',
  137 |       'Lost / Market Declined',
  138 |     ]) await expect(page.locator('.deals-board')).toContainText(stage);
  139 |     await assertNoHorizontalOverflow(page);
  140 |     await takeViewportScreenshot(page, `deals-kanban-${sizeLabel}`);
  141 | 
  142 |     await tabs.nth(2).click();
> 143 |     await expect(page.locator('main')).toContainText('placement workspace');
      |                                        ^ Error: expect(locator).toContainText(expected) failed
  144 |     await assertNoHorizontalOverflow(page);
  145 |     await takeViewportScreenshot(page, `deals-inspection-${sizeLabel}`);
  146 | 
  147 |     await page.goto('/#/vendors');
  148 |     await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
  149 |     const vendors = page.locator('.vendor-card-grid > div');
  150 |     await expect(vendors).toHaveCount(4);
  151 |     for (const vendor of [
  152 |       ['Allied Insurance', 'Maldives', 'MVR', 'allied@example.test'],
  153 |       ['Dhivehi Insurance', 'Sri Lanka', 'USD', 'dhivehi@example.test'],
  154 |       ['Island Reinsurance', 'Singapore', 'USD', 'island-re@example.test'],
  155 |       ['Inactive Carrier', 'United Arab Emirates', 'USD', 'inactive@example.test'],
  156 |     ]) {
  157 |       const card = vendors.filter({ hasText: vendor[0] });
  158 |       await expect(card).toContainText(vendor[1]);
  159 |       await expect(card).toContainText(vendor[2]);
  160 |       await expect(card).toContainText(vendor[3]);
  161 |     }
  162 |     await assertNoHorizontalOverflow(page);
  163 |     await takeViewportScreenshot(page, `vendors-${sizeLabel}`);
  164 | 
  165 |     await page.goto('/#/qslips');
  166 |     await expect(page.getByRole('heading', { name: 'Quotation Request Slips' })).toBeVisible();
  167 |     await assertTableFields(page);
  168 |     await assertNoHorizontalOverflow(page);
  169 |     await takeViewportScreenshot(page, `qslips-${sizeLabel}`);
  170 |   });
  171 | }
  172 | 
```