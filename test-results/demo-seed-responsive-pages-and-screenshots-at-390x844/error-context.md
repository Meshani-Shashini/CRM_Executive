# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-seed.spec.ts >> responsive pages and screenshots at 390x844
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
        - button "Open navigation menu" [ref=e157] [cursor=pointer]
        - heading "Deals" [level=1] [ref=e160]
        - combobox "Search clients, leads, invoices…" [ref=e165]
        - button "Notifications, 3 unread" [ref=e167] [cursor=pointer]:
          - generic [ref=e171]: "3"
        - button "Account menu for Demo Administrator" [ref=e173] [cursor=pointer]:
          - generic [ref=e174]: DA
    - main [ref=e175]:
      - generic [ref=e176]:
        - generic [ref=e177]:
          - generic [ref=e178]:
            - heading "Deals pipeline" [level=1] [ref=e179]
            - paragraph [ref=e180]: Kanban stage progression, validation, activity timeline, and placement inspection.
          - generic [ref=e181]:
            - button "Filter" [ref=e182] [cursor=pointer]
            - button "+ Legacy deal" [ref=e185] [cursor=pointer]
        - generic [ref=e187]:
          - complementary [ref=e188]:
            - generic [ref=e189]:
              - generic [ref=e191]:
                - heading "Deals & Leads" [level=2] [ref=e192]
                - paragraph [ref=e193]: 10 records
              - textbox "Search deals and leads" [ref=e194]:
                - /placeholder: Search client, product, stage…
              - combobox "Filter by product" [ref=e195]:
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
            - generic [ref=e196]:
              - button "Bonavista Maldives Contractors All Risks deal NC Market Tender & Placing Slip Submission SLA overdue MVR 500,000.00" [ref=e197] [cursor=pointer]:
                - generic [ref=e198]:
                  - generic [ref=e199]:
                    - generic [ref=e200]: Bonavista Maldives
                    - generic [ref=e201]: Contractors All Risks
                  - generic [ref=e202]: deal
                - generic [ref=e203]:
                  - generic [ref=e204]: NC
                  - generic [ref=e205]: Market Tender & Placing Slip Submission
                  - generic [ref=e206]: SLA overdue
                - generic [ref=e210]: MVR 500,000.00
              - button "Atoll Trading Property All Risk deal PR Comparative Analysis & Presentation USD 320,000.00" [ref=e211] [cursor=pointer]:
                - generic [ref=e212]:
                  - generic [ref=e213]:
                    - generic [ref=e214]: Atoll Trading
                    - generic [ref=e215]: Property All Risk
                  - generic [ref=e216]: deal
                - generic [ref=e217]:
                  - generic [ref=e218]: PR
                  - generic [ref=e219]: Comparative Analysis & Presentation
                - generic [ref=e220]: USD 320,000.00
              - button "Bonavista Maldives Bonavista Maldives - Contractors All Risks lead NC Converted to deal SLA overdue MVR 250,000.00" [ref=e221] [cursor=pointer]:
                - generic [ref=e222]:
                  - generic [ref=e223]:
                    - generic [ref=e224]: Bonavista Maldives
                    - generic [ref=e225]: Bonavista Maldives - Contractors All Risks
                  - generic [ref=e226]: lead
                - generic [ref=e227]:
                  - generic [ref=e228]: NC
                  - generic [ref=e229]: Converted to deal
                  - generic [ref=e230]: SLA overdue
                - generic [ref=e234]: MVR 250,000.00
              - button "Bonavista Maldives Atoll Trading Property Renewal lead NC Converted to deal USD 285,000.00" [ref=e235] [cursor=pointer]:
                - generic [ref=e236]:
                  - generic [ref=e237]:
                    - generic [ref=e238]: Bonavista Maldives
                    - generic [ref=e239]: Atoll Trading Property Renewal
                  - generic [ref=e240]: lead
                - generic [ref=e241]:
                  - generic [ref=e242]: NC
                  - generic [ref=e243]: Converted to deal
                - generic [ref=e244]: USD 285,000.00
              - button "Atoll Trading Lagoon Resort Fire Cover lead PR Converted to deal MVR 320,000.00" [ref=e245] [cursor=pointer]:
                - generic [ref=e246]:
                  - generic [ref=e247]:
                    - generic [ref=e248]: Atoll Trading
                    - generic [ref=e249]: Lagoon Resort Fire Cover
                  - generic [ref=e250]: lead
                - generic [ref=e251]:
                  - generic [ref=e252]: PR
                  - generic [ref=e253]: Converted to deal
                - generic [ref=e254]: MVR 320,000.00
              - button "Atoll Trading Coral Construction Machinery Cover lead PR Converted to deal USD 355,000.00" [ref=e255] [cursor=pointer]:
                - generic [ref=e256]:
                  - generic [ref=e257]:
                    - generic [ref=e258]: Atoll Trading
                    - generic [ref=e259]: Coral Construction Machinery Cover
                  - generic [ref=e260]: lead
                - generic [ref=e261]:
                  - generic [ref=e262]: PR
                  - generic [ref=e263]: Converted to deal
                - generic [ref=e264]: USD 355,000.00
              - button "Lagoon Resorts Male Retail Package lead DF Converted to deal MVR 390,000.00" [ref=e265] [cursor=pointer]:
                - generic [ref=e266]:
                  - generic [ref=e267]:
                    - generic [ref=e268]: Lagoon Resorts
                    - generic [ref=e269]: Male Retail Package
                  - generic [ref=e270]: lead
                - generic [ref=e271]:
                  - generic [ref=e272]: DF
                  - generic [ref=e273]: Converted to deal
                - generic [ref=e274]: MVR 390,000.00
              - button "Lagoon Resorts North Harbour Cargo Cover lead DF Meetings Ongoing USD 425,000.00" [ref=e275] [cursor=pointer]:
                - generic [ref=e276]:
                  - generic [ref=e277]:
                    - generic [ref=e278]: Lagoon Resorts
                    - generic [ref=e279]: North Harbour Cargo Cover
                  - generic [ref=e280]: lead
                - generic [ref=e281]:
                  - generic [ref=e282]: DF
                  - generic [ref=e283]: Meetings Ongoing
                - generic [ref=e284]: USD 425,000.00
              - button "Coral Construction South Atoll Liability Review lead CM Meetings Ongoing MVR 460,000.00" [ref=e285] [cursor=pointer]:
                - generic [ref=e286]:
                  - generic [ref=e287]:
                    - generic [ref=e288]: Coral Construction
                    - generic [ref=e289]: South Atoll Liability Review
                  - generic [ref=e290]: lead
                - generic [ref=e291]:
                  - generic [ref=e292]: CM
                  - generic [ref=e293]: Meetings Ongoing
                - generic [ref=e294]: MVR 460,000.00
              - button "Coral Construction Island Engineering Survey lead CM Meetings Ongoing MVR 495,000.00" [ref=e295] [cursor=pointer]:
                - generic [ref=e296]:
                  - generic [ref=e297]:
                    - generic [ref=e298]: Coral Construction
                    - generic [ref=e299]: Island Engineering Survey
                  - generic [ref=e300]: lead
                - generic [ref=e301]:
                  - generic [ref=e302]: CM
                  - generic [ref=e303]: Meetings Ongoing
                - generic [ref=e304]: MVR 495,000.00
          - main [ref=e305]:
            - generic [ref=e306]:
              - generic [ref=e312]:
                - generic [ref=e313]:
                  - heading "Bonavista Maldives" [level=1] [ref=e314]
                  - generic [ref=e315]: Deal
                  - generic [ref=e316]: Market Tender & Placing Slip Submission
                - generic [ref=e317]:
                  - generic [ref=e318]: Contractors All Risks · Commercial Lines Brokerage · Ref demo-deal-1
                  - button "Open linked lead · Bonavista Maldives - Contractors All Risks" [ref=e319] [cursor=pointer]
              - generic [ref=e320]:
                - tablist "Deal workspace views" [ref=e321]:
                  - tab "Kanban view" [ref=e322] [cursor=pointer]
                  - tab "Inspection view" [selected] [ref=e325] [cursor=pointer]
                - button "Edit deal" [ref=e327] [cursor=pointer]
                - button "Delete deal" [disabled] [ref=e331]
            - region "Placement telemetry stage tracker" [ref=e335]:
              - heading "Placement telemetry" [level=2] [ref=e336]
              - list [ref=e338]:
                - listitem [ref=e339]:
                  - button "Fact-Finding & Risk Survey; entered 12-Oct-2026; stage duration 25d; completed" [ref=e340] [cursor=pointer]:
                    - generic [ref=e341]: 12-Oct-2026
                    - generic [ref=e342]: Fact-Finding & Risk Survey
                  - generic [ref=e346]:
                    - generic "25d; transitioned 12-Oct-2026 from Fact-Finding & Risk Survey to Market Tender & Placing Slip Submission":
                      - text: 25d
                      - generic: 12-Oct-2026
                - listitem [ref=e347]:
                  - button "Market Tender & Placing Slip Submission; entered 12-Oct-2026; stage duration 25d; elapsed 25d; SLA overdue, target 14 days" [disabled] [ref=e348]:
                    - generic [ref=e349]: 12-Oct-2026
                    - generic [ref=e350]: Market Tender & Placing Slip Submission
                  - generic [ref=e353]:
                    - text: 25d
                    - generic [ref=e354]: · 25d
                - listitem [ref=e356]:
                  - button "Comparative Analysis & Presentation; upcoming" [ref=e357] [cursor=pointer]:
                    - generic [ref=e358]: Comparative Analysis & Presentation
                - listitem [ref=e362]:
                  - button "Underwriter Negotiation & Structuring; upcoming" [ref=e363] [cursor=pointer]:
                    - generic [ref=e364]: Underwriter Negotiation & Structuring
                - listitem [ref=e368]:
                  - button "Policy Bound / Won; upcoming" [ref=e369] [cursor=pointer]:
                    - generic [ref=e370]: Policy Bound / Won
                - listitem [ref=e374]:
                  - button "Lost / Market Declined; upcoming" [ref=e375] [cursor=pointer]:
                    - generic [ref=e376]: Lost / Market Declined
            - region "Lead 360" [ref=e379]:
              - heading "Lead 360 · Lead → Deal → Quotation Requests" [level=2] [ref=e380]
              - generic [ref=e381]:
                - generic [ref=e382]:
                  - generic [ref=e383]: Lead
                  - button "Bonavista Maldives - Contractors All Risks" [ref=e384] [cursor=pointer]
                - generic [ref=e385]:
                  - generic [ref=e386]: Deal
                  - button "Bonavista Maldives · Contractors All Risks" [ref=e387] [cursor=pointer]
                - generic [ref=e388]:
                  - generic [ref=e389]: Quotation Requests
                  - link "QR-2026-0001 Draft" [ref=e391] [cursor=pointer]:
                    - /url: "#/qslips?requestId=demo-qr-1"
                    - generic [ref=e392]: QR-2026-0001
                    - generic [ref=e393]: Draft
            - generic [ref=e394]:
              - generic [ref=e395]:
                - heading "Client & Contact Details" [level=2] [ref=e396]
                - generic [ref=e397]:
                  - generic [ref=e398]:
                    - generic [ref=e399]: Client
                    - generic [ref=e400]: Bonavista Maldives
                  - generic [ref=e401]:
                    - generic [ref=e402]: Identification
                    - generic [ref=e403]: TIN-DEMO-1
                  - generic [ref=e404]:
                    - generic [ref=e405]: Address
                    - generic [ref=e406]: Demo address 1, Male
                  - generic [ref=e407]:
                    - generic [ref=e408]: Country
                    - generic [ref=e409]: Maldives
                  - generic [ref=e410]:
                    - generic [ref=e411]: Client email
                    - generic [ref=e412]: client1@example.test
                  - generic [ref=e413]:
                    - generic [ref=e414]: Client phone
                    - generic [ref=e415]: +960 7770011
                - region "Customer contacts" [ref=e416]:
                  - heading "Contacts 1" [level=3] [ref=e419]
                  - generic [ref=e421]:
                    - generic [ref=e422]:
                      - term [ref=e423]: Name
                      - term [ref=e424]: Email
                      - term [ref=e425]: Phone
                      - term [ref=e426]: WhatsApp
                      - term [ref=e427]: Telegram
                      - term [ref=e428]:
                        - generic [ref=e429]: Edit
                    - article [ref=e431]:
                      - generic "Contact 1 · Decision Maker" [ref=e432]:
                        - generic [ref=e433]: Contact 1
                        - generic [ref=e434]: Decision Maker
                        - generic [ref=e435]: Primary
                      - generic "client1@example.test" [ref=e436]
                      - generic "+960 7770011" [ref=e437]
                      - generic "+960 7770011" [ref=e438]
                      - generic "@demoContact1" [ref=e439]
                      - button "Edit Contact 1" [ref=e440] [cursor=pointer]
                - generic [ref=e444]:
                  - heading "Update communication channels" [level=3] [ref=e445]
                  - generic [ref=e446]:
                    - textbox "Contact name" [ref=e447]: Contact 1
                    - textbox "Phone" [ref=e448]:
                      - /placeholder: Phone *
                      - text: +960 7770011
                    - textbox "WhatsApp" [ref=e449]:
                      - /placeholder: WhatsApp *
                      - text: +960 7770011
                    - textbox "Telegram" [ref=e450]:
                      - /placeholder: Telegram / @username *
                      - text: "@demoContact1"
                  - button "Save contact channels" [ref=e451] [cursor=pointer]
              - generic [ref=e454]:
                - heading "Policy Details" [level=2] [ref=e455]
                - generic [ref=e459]:
                  - generic [ref=e460]:
                    - generic [ref=e461]: Insurance Type
                    - generic [ref=e462]: Contractors All Risks
                  - generic [ref=e463]:
                    - generic [ref=e464]: Current Insurer
                    - generic [ref=e465]: Allied Insurance
                  - generic [ref=e466]:
                    - generic [ref=e467]: Sum Insured
                    - generic [ref=e468]: MVR 300,000.00
                  - generic [ref=e469]:
                    - generic [ref=e470]: Premium
                    - generic [ref=e471]: MVR 15,000.00
                  - generic [ref=e472]:
                    - generic [ref=e473]: Probability
                    - generic [ref=e474]: 40%
                  - generic [ref=e475]:
                    - generic [ref=e476]: Expected Close
                    - generic [ref=e477]: 06-Dec-2026
                  - generic [ref=e478]:
                    - generic [ref=e479]: Policy Expiry
                    - generic [ref=e480]: 07-Mar-2027
                  - generic [ref=e481]:
                    - generic [ref=e482]: Owner / Representative
                    - generic [ref=e483]: Demo Administrator
                - generic [ref=e484]:
                  - generic [ref=e485]:
                    - generic [ref=e486]:
                      - generic [ref=e487]: NC · Contractors All Risks
                      - generic [ref=e488]: Engineering · PROPERTY · 14–30 Days cycle
                    - generic [ref=e489]: High risk
                  - generic [ref=e490]: "Underwriting intake: Contract award letter, Bill of Quantities (BOQ), project programme"
            - generic [ref=e491]:
              - generic [ref=e492]:
                - generic [ref=e493]:
                  - heading "Activity" [level=2] [ref=e494]
                  - paragraph [ref=e498]: Stage movement and client touchpoints.
                - generic [ref=e499]:
                  - button "Appointment" [ref=e500] [cursor=pointer]
                  - button "Proposal" [ref=e503] [cursor=pointer]
                  - button "Note" [ref=e507] [cursor=pointer]
                  - button "Task" [ref=e509] [cursor=pointer]
              - group "Filter timeline entries" [ref=e512]:
                - button "All" [pressed] [ref=e513] [cursor=pointer]
                - button "Stage changes" [ref=e514] [cursor=pointer]
                - button "Temperature" [ref=e515] [cursor=pointer]
                - button "Activity" [ref=e516] [cursor=pointer]
                - button "Appointments" [ref=e517] [cursor=pointer]
                - button "Proposals" [ref=e518] [cursor=pointer]
                - button "Notes" [ref=e519] [cursor=pointer]
                - button "Tasks" [ref=e520] [cursor=pointer]
              - region "Activity timeline" [ref=e521]:
                - generic [ref=e522]:
                  - article [ref=e523]:
                    - time [ref=e524]: 17-Sep-2026 23:28
                    - generic [ref=e527]:
                      - generic "Deal created" [ref=e528]
                      - generic "Contractors All Risks · Market Tender & Placing Slip Submission" [ref=e529]
                  - article [ref=e530]:
                    - time [ref=e531]: 12-Oct-2026 23:28
                    - 'generic "Stage: Market Tender & Placing Slip Submission" [ref=e535]'
                  - article [ref=e536]:
                    - time [ref=e537]: 06-Nov-2026 23:28
                    - generic [ref=e540]:
                      - generic "Demo seed" [ref=e541]
                      - generic "Local-only data for browser QA. · By Demo Administrator" [ref=e542]
            - generic [ref=e543]:
              - generic [ref=e544]:
                - heading "Compliance alerts" [level=2] [ref=e545]
                - generic [ref=e549]:
                  - paragraph [ref=e550]: Communication details are complete.
                  - paragraph [ref=e553]: "Required intake: Contract award letter, Bill of Quantities (BOQ), project programme"
                  - paragraph [ref=e554]: This stage exceeded its 14-day target SLA.
              - generic [ref=e557]:
                - generic [ref=e558]:
                  - heading "Quotes comparison" [level=2] [ref=e559]
                  - button "Quote" [ref=e563] [cursor=pointer]
                - paragraph [ref=e565]: No insurer quotes recorded. Add quotes to compare premium and terms.
              - generic [ref=e566]:
                - heading "Binding actions" [level=2] [ref=e567]
                - generic [ref=e568]:
                  - button "Add quote" [ref=e569] [cursor=pointer]
                  - button "Bind policy" [ref=e573] [cursor=pointer]
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