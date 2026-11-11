import { createDemoSeed } from '../src/dev/demoSeed.ts';
import { isValidEmail, isValidPhoneNumber } from '../src/utils/communication.ts';
import { normalizeContactNumber } from '../src/utils/contactProfiles.ts';
import { hasCompleteClientProfile } from '../src/utils/customerProfile.ts';

const fixedDate = Date.UTC(2026, 0, 1);
const first = createDemoSeed(fixedDate);
const second = createDemoSeed(fixedDate);
const withLeads = createDemoSeed(fixedDate, true);
const withLeadsAgain = createDemoSeed(fixedDate, true);
const issues = [];

const check = (found, description) => {
  if (!found) issues.push(description);
};

check(JSON.stringify(first) === JSON.stringify(second), 'seed is not idempotent');
check(first.company && typeof first.company === 'object', 'company settings are missing');
check(first.company.name && first.company.name.length > 0, 'company name is blank');
check(first.users.length === 3, 'expected exactly three demo users (admin, sales, finance)');
check(first.users.every((user) => user.role !== 'client'), 'client demo user should be omitted when no client exists');
check(first.products.length > 0, 'products are missing');
check(first.pipelines.length === 3, 'expected exactly three active demo pipelines');
check(first.pipelineStages.length === 27, 'expected nine stages in each of three pipelines');
check(first.taxRates.some((rate) => rate.category === 'Standard' && rate.active && rate.rate > 0), 'expected an active standard GST tax rate');
check(Object.keys(first.emailTemplates).length === 5, 'expected the default five email templates');
check(first.vendors.length >= 3, 'expected insurer/reinsurer vendors to be present');
check(first.customerLookups && Object.keys(first.customerLookups).length > 0, 'customer lookups are missing');
check(first.leads.length === 0, 'base seed must contain zero leads');
check(first.clients.length === 0, 'base seed must contain zero clients');

check(JSON.stringify(withLeads) === JSON.stringify(withLeadsAgain), 'optional lead seed is not idempotent');
check(withLeads.leads.length === 6, 'optional lead seed must contain exactly six leads');
check(withLeads.clients.length === 6, 'optional lead seed must create one organization per lead');
check(withLeads.leads.every((lead) => withLeads.clients.some((client) => client.id === lead.clientId && client.name === lead.client)), 'every optional lead must link to its seeded organization');
check(withLeads.leads.every((lead) => withLeads.users.some((user) => user.id === lead.ownerId)), 'every optional lead must have a valid owner');
check(withLeads.leads.every((lead) => withLeads.products.some((product) => product.code === lead.productCode)), 'every optional lead must use a catalog product');

const expectedStages = ['Lead Identified', 'Contact Made', 'Key Person Identified', 'Intro Email Sent', 'Meetings Ongoing', 'Lost'];
check(expectedStages.every((stage) => withLeads.leads.some((lead) => lead.funnelStage === stage)), 'optional leads must cover each required lifecycle stage');

for (const lead of withLeads.leads) {
  const client = withLeads.clients.find((candidate) => candidate.id === lead.clientId);
  const phone = lead.contactPhone ?? '';
  const whatsapp = lead.whatsapp ?? '';
  check(Boolean(lead.title?.trim()), `lead ${lead.id} is missing a title`);
  check(Boolean(lead.closeDate && Number.isFinite(Date.parse(lead.closeDate))), `lead ${lead.id} is missing an expected close date`);
  check(Boolean(lead.value !== undefined && Number.isFinite(lead.value) && lead.value >= 0), `lead ${lead.id} has an invalid value`);
  check(lead.currency === 'MVR' || lead.currency === 'USD', `lead ${lead.id} has an invalid currency`);
  check(Boolean(lead.ownerId), `lead ${lead.id} is missing an owner`);
  check(isValidEmail(lead.contactEmail ?? ''), `lead ${lead.id} has an invalid primary contact email`);
  check(isValidPhoneNumber(phone), `lead ${lead.id} has an invalid primary contact phone`);
  check(isValidPhoneNumber(whatsapp), `lead ${lead.id} has an invalid WhatsApp number`);
  check(phone === `+${normalizeContactNumber(phone)}`, `lead ${lead.id} phone is not normalized`);
  check(whatsapp === `+${normalizeContactNumber(whatsapp)}`, `lead ${lead.id} WhatsApp number is not normalized`);
  check(Boolean(client && hasCompleteClientProfile(client)), `lead ${lead.id} organization profile is incomplete`);
  if (lead.funnelStage === 'Lost') check(Boolean(lead.lossReason?.trim()), 'the Lost lead must include a loss reason');
  if (lead.funnelStage === 'Lead Identified') check(lead.stageHistory?.length === 0, 'Lead Identified must be the initial stage without a transition');
  const history = lead.stageHistory ?? [];
  for (const [index, transition] of history.entries()) {
    const priorStage = index === 0 ? 'Lead Identified' : history[index - 1].toStage;
    check(transition.fromStage === priorStage, `lead ${lead.id} has a discontinuous stage history`);
    check(Number.isFinite(Date.parse(transition.enteredAt)), `lead ${lead.id} has an invalid stage transition timestamp`);
    check(Number.isFinite(transition.durationDays) && transition.durationDays >= 0, `lead ${lead.id} has an invalid stage duration`);
  }
  check(history.length === 0 ? lead.funnelStage === 'Lead Identified' : history.at(-1)?.toStage === lead.funnelStage, `lead ${lead.id} stage history does not match its current stage`);
}

for (const seed of [first, withLeads]) {
  const label = seed === first ? 'base' : 'optional';
  check(seed.deals.length === 0, `${label} seed must contain zero deals`);
  check(seed.deals.every((deal) => Boolean(deal.leadId)), `${label} seed contains a deal without a leadId`);
  check(seed.quotationRequests.length === 0, `${label} seed must contain zero quotation requests`);
  check(seed.invoices.length === 0, `${label} seed must contain zero invoices`);
  check(seed.payments.length === 0, `${label} seed must contain zero payments`);
  check(seed.activities.length === 0, `${label} seed must contain zero activities`);
  check(seed.stageHistory.length === 0, `${label} seed must contain zero deal stage history`);
}

if (issues.length) {
  console.error(`Demo seed check failed (${issues.length} issue(s)):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('Demo seed checks passed: neutral base by default; optional mode adds six validated leads and linked organizations only.');
}
