import { describe, expect, it } from 'vitest';
import type { QuotationRequest, QuotationRequestLine } from '../../types';
import { nextLocalReference } from '../references';
import { createQuotationSection } from '../quotationSectionTemplates';
import { quotationLineRowActions } from '../quotationRequestStatus';
import {
  createLineReference, deriveRequestStatus, formatQuotationLineActivity, formatQuotationLineReference,
  getQuotationLineDisplayStatus, hasActiveQuotationLine, hasDuplicateQuotationReferences,
  deriveSectionStatus, nextLineReference, normalizeQuotationRequest, quotationLineStatusCellText,
} from '../quotationRequests';

function line(reference: string, status: QuotationRequestLine['status']): QuotationRequestLine {
  return {
    id: reference,
    reference,
    sectionId: 'section-1',
    vendorId: `vendor-${reference}`,
    status,
    quotes: [],
    remarks: '',
    statusHistory: [],
  };
}

function request(lines: QuotationRequestLine[]): QuotationRequest {
  return {
    id: 'qrs-1',
    reference: 'QRS-012-2026',
    issuedAt: '2026-01-01',
    dealId: 'deal-1',
    leadId: 'lead-1',
    clientId: 'client-1',
    insuredName: 'Client',
    businessActivity: '',
    additionalActivity: '',
    riskLocation: '',
    territorialLimits: '',
    occupation: '',
    periodOfInsurance: 'TBA',
    requiredBy: '2026-12-01',
    currency: 'MVR',
    notes: '',
    preparedBy: 'user-1',
    checkedBy: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [createQuotationSection('section-1', 1, { code: 'PR', name: 'Property All Risk' })],
    lines,
  };
}

describe('quotation request batches', () => {
  it('allocates batch references above existing references and persisted counters', () => {
    expect(nextLocalReference('quotation-request', 2026, ['QR-2026-0008', 'QRS-2026-0012']))
      .toBe('QRS-013-2026');
    expect(nextLocalReference('quotation-request', 2026, [], 18)).toBe('QRS-019-2026');
    expect(nextLocalReference('quotation-request', 2027, ['QRS-012-2026'])).toBe('QRS-001-2027');
  });

  it('assigns section-specific stable line references and advances past cancelled suffixes', () => {
    expect(createLineReference('QRS-012-2026', 1, 1)).toBe('QRS-012-2026-01-01');
    const batch = request([line('QRS-012-2026-01-01', 'Cancelled'), line('QRS-012-2026-01-03', 'Sent')]);
    expect(nextLineReference(batch, 'section-1')).toBe('QRS-012-2026-01-04');
    expect(deriveSectionStatus('section-1', batch.lines)).toBe('Active');
    expect(deriveSectionStatus('section-1', [line('QRS-012-2026-01-01', 'Cancelled')])).toBe('Cancelled');
  });

  it('derives whole-batch states from individual line states', () => {
    expect(deriveRequestStatus([line('a', 'Requested')])).toBe('Requested');
    expect(deriveRequestStatus([line('a', 'Sent'), line('b', 'Sent')])).toBe('Sent');
    expect(deriveRequestStatus([line('a', 'Quoted'), line('b', 'Declined')])).toBe('Partially Quoted');
    expect(deriveRequestStatus([line('a', 'Quoted'), line('b', 'Quoted')])).toBe('Quoted');
    expect(deriveRequestStatus([line('a', 'Cancelled'), line('b', 'Cancelled')])).toBe('Cancelled');
  });

  it('keeps cancellation precedence over an expired quote and only expires sent or quoted lines', () => {
    const now = new Date('2026-11-11T12:00:00.000Z');
    const expiredQuote = { ...line('QRS-012-2026-01-01', 'Sent'), validUntil: '2026-11-10' };
    expect(getQuotationLineDisplayStatus({
      ...expiredQuote,
      statusHistory: [{ fromStatus: 'Sent' as const, toStatus: 'Cancelled' as const, changedAt: '2026-11-10T12:00:00.000Z', changedBy: 'user-1' }],
    }, now)).toBe('Cancelled');
    expect(getQuotationLineDisplayStatus(expiredQuote, now)).toBe('Expired');
    expect(getQuotationLineDisplayStatus({ ...expiredQuote, status: 'Requested' }, now)).toBe('Requested');
    expect(getQuotationLineDisplayStatus({ ...expiredQuote, status: 'Quoted', validUntil: '2026-11-12' }, now)).toBe('Quoted');
    expect(getQuotationLineDisplayStatus({ ...expiredQuote, status: 'Quoted', statusHistory: [
      { fromStatus: 'Sent', toStatus: 'Declined', changedAt: '2026-11-10T12:00:00.000Z', changedBy: 'user-1' },
    ] }, now)).toBe('Declined');
  });

  it('uses status-aware text for empty quote cells', () => {
    const now = new Date('2026-11-11T12:00:00.000Z');
    expect(quotationLineStatusCellText(line('requested', 'Requested'), now)).toBe('Awaiting quote');
    expect(quotationLineStatusCellText(line('sent', 'Sent'), now)).toBe('Awaiting quote');
    expect(quotationLineStatusCellText(line('quoted', 'Quoted'), now)).toBeUndefined();
    expect(quotationLineStatusCellText({ ...line('declined', 'Declined'), declineReason: 'Outside appetite' }, now))
      .toBe('Declined: Outside appetite');
    expect(quotationLineStatusCellText(line('cancelled', 'Cancelled'), now)).toBe('Cancelled');
    expect(quotationLineStatusCellText({ ...line('expired', 'Sent'), validUntil: '2026-11-10' }, now))
      .toBe('Expired 2026-11-10');
  });

  it('offers only the row actions supported by each line status and transition rules', () => {
    expect(quotationLineRowActions('Requested', 'Requested', 'sales')).toEqual(['send', 'cancel']);
    expect(quotationLineRowActions('Sent', 'Sent', 'sales')).toEqual(['log-quote', 'decline', 'cancel']);
    expect(quotationLineRowActions('Quoted', 'Quoted', 'sales')).toEqual(['edit-quote', 'cancel']);
    expect(quotationLineRowActions('Declined', 'Declined', 'sales')).toEqual([]);
    expect(quotationLineRowActions('Cancelled', 'Cancelled', 'admin', true)).toEqual(['reopen']);
    expect(quotationLineRowActions('Expired', 'Sent', 'sales')).toEqual([]);
    expect(quotationLineRowActions('Expired', 'Sent', 'admin', true)).toEqual(['reopen']);
  });

  it('displays stored line references verbatim in labels and activity messages', () => {
    const storedReference = 'QRS-2026-0001-01';
    const storedLine = { ...line(storedReference, 'Sent'), reference: storedReference };
    expect(formatQuotationLineReference(storedLine)).toBe(storedReference);
    expect(formatQuotationLineActivity(formatQuotationLineReference(storedLine), 'Sent → Cancelled'))
      .toBe(`${storedReference} · Sent → Cancelled`);
  });

  it('only treats a cancelled insurer line as inactive for its section', () => {
    const activeLine = line('QRS-012-2026-01-01', 'Sent');
    const cancelledLine = {
      ...line('QRS-012-2026-01-02', 'Expired'),
      statusHistory: [{ fromStatus: 'Sent' as const, toStatus: 'Cancelled' as const, changedAt: '2026-11-10T12:00:00.000Z', changedBy: 'user-1' }],
    };
    expect(hasActiveQuotationLine([activeLine], 'section-1', activeLine.vendorId)).toBe(true);
    expect(hasActiveQuotationLine([cancelledLine], 'section-1', cancelledLine.vendorId)).toBe(false);
  });

  it('normalizes legacy single-reference requests idempotently', () => {
    const legacy = {
      id: 'qrs-legacy',
      ref: 'QR-2026-0007',
      dealId: 'deal-1',
      leadId: 'lead-1',
      clientId: 'client-1',
      vendorIds: ['vendor-a', 'vendor-b'],
      sumInsured: 250000,
      currency: 'USD',
      requiredBy: '2026-12-01',
      notes: '',
      status: 'Responses received',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const normalized = normalizeQuotationRequest(legacy);
    expect(normalized?.reference).toBe('QRS-007-2026');
    expect(normalized?.sections).toHaveLength(1);
    expect(normalized?.sections[0].data.totalSumInsured).toBe(250000);
    expect(normalized?.lines.map(({ reference, status }) => [reference, status])).toEqual([
      ['QRS-007-2026-01-01', 'Quoted'],
      ['QRS-007-2026-01-02', 'Quoted'],
    ]);
    expect(normalizeQuotationRequest(normalized)).toEqual(normalized);
  });

  it('detects duplicate batch and line references', () => {
    const first = request([line('QRS-012-2026-01-01', 'Sent')]);
    const duplicateLine = request([line('QRS-012-2026-01-01', 'Quoted')]);
    expect(hasDuplicateQuotationReferences([first])).toBe(false);
    expect(hasDuplicateQuotationReferences([first, duplicateLine])).toBe(true);
    expect(hasDuplicateQuotationReferences([request([line('QRS-012-2026', 'Sent')])])).toBe(true);
  });
});
