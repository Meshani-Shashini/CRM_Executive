import { describe, expect, it } from 'vitest';
import type { Client, Deal, Invoice, Lead, Pipeline, PipelineStage, ProductCode, StageHistoryAudit } from '../../types';
import { isValidEmail } from '../communication';
import { convertedDealsOnly } from '../dealFactory';
import { invoiceTotalInMvr } from '../invoiceTotals';
import { buildLeadConversion } from '../leadConversion';
import { activeUnconvertedLeads } from '../leadLifecycle';
import { canTransitionQuotationRequestStatus, quotationRequestStatusOptions } from '../quotationRequestStatus';
import { isStageSlaOverdue } from '../stageSla';

describe('requested CRM fixes', () => {
  it('uses the lead email validator for optional vendor emails', () => {
    expect(isValidEmail('  contact@example.com  ')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('assigns the selected pipeline to both the converted deal and lead', () => {
    const lead: Lead = {
      id: 'lead-1',
      client: 'Acme',
      clientId: 'client-1',
      contact: 'Pat',
      country: 'Maldives',
      insuranceClass: 'Engineering',
      productCode: 'PR',
      temperature: 'WARM',
      status: 'IN-PROGRESS',
      funnelStage: 'L3: Qualified Opportunity',
      renewalDate: '2025-12-01',
      sumInsured: 1000,
      premium: 50,
      ownerId: 'user-1',
      lastActivity: '2025-01-01',
    };
    const client: Client = {
      id: 'client-1', name: 'Acme', tin: '', country: 'Maldives', phone: '+9601234567',
      email: 'contact@example.com', address: 'Male', sumInsured: 1000, premium: 50,
      expiry: '2025-12-01', insurer: 'Vendor', productCode: 'PR', class: 'Engineering',
      ownerId: 'user-1', tags: [],
    };
    const product: ProductCode = {
      code: 'PR', name: 'Property', description: '', category: 'General', classType: 'Property',
      defaultPipelineCode: 'COMMERCIAL', standardBrokerageRatePct: 10, isStatutoryMandatory: false,
    };
    const pipeline: Pipeline = {
      id: 'pipeline-selected', tenantId: 'tenant-1', name: 'Selected', code: 'COMMERCIAL', isActive: true,
    };
    const firstStage: PipelineStage = {
      id: 'stage-first', pipelineId: pipeline.id, name: 'New', stageOrder: 1,
      winProbabilityPct: 10, stagnationDaysThreshold: 5,
    };

    const conversion = buildLeadConversion({
      lead, client, product, pipeline, firstStage,
      contactChannels: { contactPhone: '+9601234567', whatsapp: '+9601234567', telegram: '@validuser' },
    });

    expect(conversion?.deal.pipelineId).toBe(pipeline.id);
    expect(conversion?.deal.id).not.toBe(lead.id);
    expect(conversion?.deal.leadId).toBe(lead.id);
    expect(conversion?.leadUpdate.dealId).toBe(conversion?.deal.id);
    expect(conversion?.leadUpdate.pipelineId).toBe(pipeline.id);
  });

  it('only includes deals linked back to a converted lead, including terminal deals', () => {
    const makeDeal = (id: string, leadId: string): Deal => ({
      id, leadId, client: 'Acme', product: 'Property', value: 1000, weighted: 100,
      currency: 'MVR', stage: 'New', probability: 10, ownerId: 'user-1',
      closeDate: '2025-12-01', insurer: 'Vendor',
    });
    const makeLead = (id: string, dealId?: string, disposition?: Lead['disposition']): Lead => ({
      id, dealId, client: 'Acme', contact: 'Pat', country: 'Maldives',
      insuranceClass: 'Engineering', productCode: 'PR', temperature: 'WARM',
      status: 'IN-PROGRESS', funnelStage: dealId ? 'Converted to deal' : 'Lead Identified',
      disposition, renewalDate: '2025-12-01', sumInsured: 1000, premium: 50,
      ownerId: 'user-1', lastActivity: '2025-01-01',
    });

    const deals = [
      makeDeal('deal-converted', 'lead-converted'),
      makeDeal('deal-terminal', 'lead-terminal'),
      makeDeal('deal-raw', 'lead-raw'),
    ];
    const leads = [
      makeLead('lead-converted', 'deal-converted', 'converted'),
      makeLead('lead-terminal', 'deal-terminal'),
      makeLead('lead-raw'),
    ];

    expect(convertedDealsOnly(deals, leads).map((deal) => deal.id))
      .toEqual(['deal-converted', 'deal-terminal']);
  });

  it('excludes closed, converted, and deal-linked records from active Leads', () => {
    const makeLead = (id: string, updates: Partial<Lead> = {}): Lead => ({
      id, client: 'Acme', contact: 'Pat', country: 'Maldives',
      insuranceClass: 'Engineering', productCode: 'PR', temperature: 'WARM',
      status: 'IN-PROGRESS', funnelStage: 'Lead Identified',
      renewalDate: '2025-12-01', sumInsured: 1000, premium: 50,
      ownerId: 'user-1', lastActivity: '2025-01-01', ...updates,
    });
    const leads = [
      makeLead('active'),
      makeLead('converted-status', { status: 'CONVERTED' as Lead['status'] }),
      makeLead('closed-status', { status: 'CLOSED' as Lead['status'] }),
      makeLead('converted-stage', { funnelStage: 'CONVERTED' }),
      makeLead('closed-stage', { funnelStage: 'Lost' }),
      makeLead('linked-by-lead', { dealId: 'deal-1' }),
      makeLead('linked-by-deal'),
      makeLead('same-id-as-deal'),
    ];

    expect(activeUnconvertedLeads(leads, [
      { id: 'deal-2', leadId: 'linked-by-deal' },
      { id: 'same-id-as-deal', leadId: 'another-lead' },
    ]).map((lead) => lead.id)).toEqual(['active']);
  });

  it('allows admins and authorized deal owners to manage QRS status transitions', () => {
    expect(canTransitionQuotationRequestStatus('Requested', 'Sent', 'sales')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Sent', 'Quoted', 'sales')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Sent', 'Requested', 'sales')).toBe(false);
    expect(canTransitionQuotationRequestStatus('Quoted', 'Sent', 'admin')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Cancelled', 'Sent', 'admin')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Cancelled', 'Requested', 'sales', true)).toBe(true);
    expect(canTransitionQuotationRequestStatus('Quoted', 'Cancelled', 'sales', true)).toBe(true);
    expect(quotationRequestStatusOptions('Sent', 'sales').map(({ status }) => status))
      .toEqual(['Sent', 'Quoted', 'Declined', 'Expired', 'Cancelled']);
    expect(quotationRequestStatusOptions('Cancelled', 'sales', true).map(({ status }) => status))
      .toEqual(['Cancelled', 'Requested', 'Sent', 'Quoted', 'Declined', 'Expired']);
    expect(quotationRequestStatusOptions('Quoted', 'admin').find(({ status }) => status === 'Sent')?.label)
      .toBe('Reopen to Sent');
  });

  it('marks a stage overdue only after the threshold is exceeded', () => {
    const start = Date.parse('2025-01-01T00:00:00.000Z');
    expect(isStageSlaOverdue('2025-01-01T00:00:00.000Z', 2, start + 2 * 86400000)).toBe(false);
    expect(isStageSlaOverdue('2025-01-01T00:00:00.000Z', 2, start + 2 * 86400000 + 1)).toBe(true);
  });

  it('converts each invoice total to MVR before aggregating', () => {
    const makeInvoice = (id: string, currency: Invoice['currency'], unitPrice: number): Invoice => ({
      id, number: id, clientId: 'client-1', clientName: 'Acme', insurer: 'Insurer', policyNo: 'P1',
      issueDate: '2025-01-01', dueDate: '2025-02-01', status: 'Pending',
      items: [{ description: 'Premium', qty: 1, unitPrice, vatRate: 0 }],
      installments: [], currency,
    });

    expect(invoiceTotalInMvr(makeInvoice('mvr', 'MVR', 100))).toBe(100);
    expect(invoiceTotalInMvr(makeInvoice('usd', 'USD', 10))).toBe(154.2);
  });

  it('allows old stage-history rows without actor fields while supporting named actors', () => {
    const oldRow: StageHistoryAudit = {
      id: 'old', tenantId: 'tenant-1', dealId: 'deal-1', fromStageId: null, toStageId: 'stage-1',
      enteredAt: '2025-01-01', exitedAt: null, durationSeconds: null,
    };
    const actorRow: StageHistoryAudit = { ...oldRow, id: 'new', userId: 'user-1', userName: 'Pat' };

    expect(actorRow.userId).toBe('user-1');
    expect(oldRow).not.toHaveProperty('userId');
  });
});
