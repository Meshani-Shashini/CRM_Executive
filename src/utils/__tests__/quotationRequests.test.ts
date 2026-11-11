import { describe, expect, it } from 'vitest';
import type { QuotationRequest, QuotationRequestLine } from '../../types';
import { nextLocalReference } from '../references';
import {
  createLineReference, deriveRequestStatus, hasDuplicateQuotationReferences,
  nextLineReference, normalizeQuotationRequest,
} from '../quotationRequests';

function line(reference: string, status: QuotationRequestLine['status']): QuotationRequestLine {
  return {
    id: reference,
    reference,
    vendorId: `vendor-${reference}`,
    status,
    remarks: '',
    statusHistory: [],
  };
}

function request(lines: QuotationRequestLine[]): QuotationRequest {
  return {
    id: 'qrs-1',
    reference: 'QRS-2026-0012',
    dealId: 'deal-1',
    leadId: 'lead-1',
    clientId: 'client-1',
    requiredBy: '2026-12-01',
    insuredAmount: 100000,
    currency: 'MVR',
    notes: '',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lines,
  };
}

describe('quotation request batches', () => {
  it('allocates batch references above existing references and persisted counters', () => {
    expect(nextLocalReference('quotation-request', 2026, ['QR-2026-0008', 'QRS-2026-0012']))
      .toBe('QRS-2026-0013');
    expect(nextLocalReference('quotation-request', 2026, [], 18)).toBe('QRS-2026-0019');
    expect(nextLocalReference('quotation-request', 2027, ['QRS-2026-0012'])).toBe('QRS-2027-0001');
  });

  it('assigns stable ordered line references and advances past cancelled suffixes', () => {
    expect(createLineReference('QRS-2026-0012', 1)).toBe('QRS-2026-0012-01');
    const batch = request([line('QRS-2026-0012-01', 'Cancelled'), line('QRS-2026-0012-03', 'Sent')]);
    expect(nextLineReference(batch)).toBe('QRS-2026-0012-04');
  });

  it('derives whole-batch states from individual line states', () => {
    expect(deriveRequestStatus([line('a', 'Requested')])).toBe('Requested');
    expect(deriveRequestStatus([line('a', 'Sent'), line('b', 'Sent')])).toBe('Sent');
    expect(deriveRequestStatus([line('a', 'Quoted'), line('b', 'Declined')])).toBe('Partially Quoted');
    expect(deriveRequestStatus([line('a', 'Quoted'), line('b', 'Quoted')])).toBe('Quoted');
    expect(deriveRequestStatus([line('a', 'Cancelled'), line('b', 'Cancelled')])).toBe('Cancelled');
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
    expect(normalized?.reference).toBe('QR-2026-0007');
    expect(normalized?.insuredAmount).toBe(250000);
    expect(normalized?.lines.map(({ reference, status }) => [reference, status])).toEqual([
      ['QR-2026-0007-01', 'Quoted'],
      ['QR-2026-0007-02', 'Quoted'],
    ]);
    expect(normalizeQuotationRequest(normalized)?.lines).toEqual(normalized?.lines);
  });

  it('detects duplicate batch and line references', () => {
    const first = request([line('QRS-2026-0012-01', 'Sent')]);
    const duplicateLine = request([line('QRS-2026-0012-01', 'Quoted')]);
    expect(hasDuplicateQuotationReferences([first])).toBe(false);
    expect(hasDuplicateQuotationReferences([first, duplicateLine])).toBe(true);
    expect(hasDuplicateQuotationReferences([request([line('QRS-2026-0012', 'Sent')])])).toBe(true);
  });
});
