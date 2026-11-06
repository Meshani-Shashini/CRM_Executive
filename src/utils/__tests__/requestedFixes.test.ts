import { describe, expect, it } from 'vitest';
import type { Client, Invoice, Lead, Pipeline, PipelineStage, ProductCode, StageHistoryAudit } from '../../types';
import { isValidEmail } from '../communication';
import { invoiceTotalInMvr } from '../invoiceTotals';
import { buildLeadConversion } from '../leadConversion';
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
    expect(conversion?.leadUpdate.pipelineId).toBe(pipeline.id);
  });

  it('enforces next-step and admin-only reopen transitions', () => {
    expect(canTransitionQuotationRequestStatus('Draft', 'Sent', 'sales')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Draft', 'Closed', 'sales')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Responses received', 'Sent', 'sales')).toBe(false);
    expect(canTransitionQuotationRequestStatus('Responses received', 'Sent', 'admin')).toBe(true);
    expect(canTransitionQuotationRequestStatus('Closed', 'Closed', 'admin')).toBe(false);
    expect(quotationRequestStatusOptions('Sent', 'sales').map(({ status }) => status))
      .toEqual(['Sent', 'Responses received', 'Closed']);
    expect(quotationRequestStatusOptions('Sent', 'admin').find(({ status }) => status === 'Draft')?.label)
      .toBe('Reopen to Draft');

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
