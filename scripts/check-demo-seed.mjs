import { createDemoSeed } from '../src/dev/demoSeed.ts';

const first = createDemoSeed(Date.UTC(2026, 0, 1));
const second = createDemoSeed(Date.UTC(2026, 0, 1));
const issues = [];

if (JSON.stringify(first) !== JSON.stringify(second)) issues.push('seed is not idempotent');

const ids = (items) => new Set(items.map((item) => item.id));
const clientIds = ids(first.clients);
const leadIds = ids(first.leads);
const dealIds = ids(first.deals);
const vendorIds = ids(first.vendors);
const pipelineIds = ids(first.pipelines);
const productCodes = new Set(['NC', 'PR', 'DF', 'CM']);
const check = (found, description) => {
  if (!found) issues.push(description);
};

check(first.pipelines.length === 3, 'expected exactly three pipelines');
check(first.vendors.length === 4, 'expected four vendors');
check(first.clients.length === 4, 'expected four clients');
check(first.leads.length === 8, 'expected eight leads');
check(first.deals.length === 5, 'expected five deals');
check(first.quotationRequests.length === 3, 'expected three quotation requests');
check(first.invoices.length === 2, 'expected two invoices');

for (const lead of first.leads) {
  check(clientIds.has(lead.clientId ?? ''), `lead ${lead.id} references missing client ${lead.clientId}`);
  if (lead.dealId) check(dealIds.has(lead.dealId), `lead ${lead.id} references missing deal ${lead.dealId}`);
}
for (const deal of first.deals) {
  check(leadIds.has(deal.leadId), `deal ${deal.id} references missing lead ${deal.leadId}`);
  check(clientIds.has(deal.clientId ?? ''), `deal ${deal.id} references missing client ${deal.clientId}`);
  check(vendorIds.has(deal.vendorId ?? ''), `deal ${deal.id} references missing vendor ${deal.vendorId}`);
  check(pipelineIds.has(deal.pipelineId ?? ''), `deal ${deal.id} references missing pipeline ${deal.pipelineId}`);
  const lead = first.leads.find((item) => item.id === deal.leadId);
  check(lead?.dealId === deal.id, `deal ${deal.id} is not linked back from its lead`);
  check(lead?.pipelineId === deal.pipelineId, `lead/deal pipeline mismatch for ${deal.id}`);
}
for (const request of first.quotationRequests) {
  check(dealIds.has(request.dealId), `quotation request ${request.id} references missing deal ${request.dealId}`);
  check(leadIds.has(request.leadId), `quotation request ${request.id} references missing lead ${request.leadId}`);
  check(clientIds.has(request.clientId), `quotation request ${request.id} references missing client ${request.clientId}`);
  check(request.vendorIds.every((id) => vendorIds.has(id)), `quotation request ${request.id} references a missing vendor`);
  check(productCodes.has(request.productCode), `quotation request ${request.id} references unknown product ${request.productCode}`);
}
for (const invoice of first.invoices) {
  check(clientIds.has(invoice.clientId), `invoice ${invoice.id} references missing client ${invoice.clientId}`);
  if (invoice.linkedDealId) check(dealIds.has(invoice.linkedDealId), `invoice ${invoice.id} references missing deal ${invoice.linkedDealId}`);
}
for (const history of first.stageHistory) {
  check(dealIds.has(history.dealId), `stage history ${history.id} references missing deal ${history.dealId}`);
}
for (const activity of first.activities) {
  check(clientIds.has(activity.clientId), `activity ${activity.id} references missing client ${activity.clientId}`);
  if (activity.leadId) check(leadIds.has(activity.leadId), `activity ${activity.id} references missing lead ${activity.leadId}`);
  if (activity.dealId) check(dealIds.has(activity.dealId), `activity ${activity.id} references missing deal ${activity.dealId}`);
}
for (const client of first.clients) {
  for (const contact of client.contacts ?? []) {
    for (const id of contact.linkedLeadIds ?? []) check(leadIds.has(id), `contact ${contact.id} references missing lead ${id}`);
    for (const id of contact.linkedDealIds ?? []) check(dealIds.has(id), `contact ${contact.id} references missing deal ${id}`);
  }
}

if (issues.length) {
  console.error(`Demo seed check failed (${issues.length} issue(s)):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('Demo seed is idempotent; all seeded references resolve.');
}
