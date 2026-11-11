import type {
  QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus, QuotationRequestLineStatusChange,
} from '../types';

export type DerivedQuotationRequestStatus =
  | QuotationRequestLineStatus
  | 'Partially Quoted';

export function deriveRequestStatus(lines: QuotationRequestLine[]): DerivedQuotationRequestStatus {
  if (!lines.length) return 'Requested';
  const statuses = lines.map((line) => line.status);
  if (statuses.every((status) => status === 'Cancelled')) return 'Cancelled';
  if (statuses.some((status) => status === 'Quoted')
    && statuses.some((status) => status !== 'Quoted')) {
    return 'Partially Quoted';
  }
  if (statuses.every((status) => status === statuses[0])) return statuses[0];
  if (statuses.some((status) => status === 'Requested' || status === 'Sent')) return 'Sent';
  if (statuses.some((status) => status === 'Declined')) return 'Declined';
  if (statuses.some((status) => status === 'Expired')) return 'Expired';
  return 'Cancelled';
}

export function createLineReference(batchReference: string, index: number) {
  if (!Number.isInteger(index) || index < 1) throw new Error('Quotation line index must be a positive integer.');
  return `${batchReference}-${String(index).padStart(2, '0')}`;
}

export function nextLineReference(request: QuotationRequest) {
  const prefix = `${request.reference}-`;
  const highestIndex = request.lines.reduce((highest, line) => {
    if (!line.reference.startsWith(prefix)) return highest;
    const suffix = line.reference.slice(prefix.length);
    const index = Number(suffix);
    return /^\d+$/.test(suffix) ? Math.max(highest, index) : highest;
  }, 0);
  return createLineReference(request.reference, highestIndex + 1);
}

export function hasDuplicateQuotationReferences(requests: QuotationRequest[]) {
  const references = requests.flatMap((request) => [
    request.reference,
    ...request.lines.map((line) => line.reference),
  ]);
  return new Set(references).size !== references.length;
}

const isLineStatus = (value: unknown): value is QuotationRequestLineStatus =>
  value === 'Requested' || value === 'Sent' || value === 'Quoted' || value === 'Declined'
  || value === 'Expired' || value === 'Cancelled';

const legacyStatusMap: Record<string, QuotationRequestLineStatus> = {
  Draft: 'Requested',
  Requested: 'Requested',
  Sent: 'Sent',
  'Responses received': 'Quoted',
  Quoted: 'Quoted',
  Closed: 'Cancelled',
  Cancelled: 'Cancelled',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStatusHistory(value: unknown): QuotationRequestLineStatusChange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((entry) => {
    if (!isLineStatus(entry.toStatus) || typeof entry.changedAt !== 'string'
      || typeof entry.changedBy !== 'string') return [];
    return [{
      ...(isLineStatus(entry.fromStatus) ? { fromStatus: entry.fromStatus } : {}),
      toStatus: entry.toStatus,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy,
      ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
    }];
  });
}

export function normalizeQuotationRequest(value: unknown): QuotationRequest | null {
  if (!isRecord(value)) return null;
  const reference = typeof value.reference === 'string'
    ? value.reference
    : typeof value.ref === 'string' ? value.ref : '';
  if (!reference || typeof value.id !== 'string' || typeof value.dealId !== 'string'
    || typeof value.leadId !== 'string' || typeof value.clientId !== 'string') return null;
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString();
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  const createdBy = typeof value.createdBy === 'string' ? value.createdBy : '';
  const rawLines = Array.isArray(value.lines) ? value.lines : null;

  if (rawLines) {
    const lines = rawLines.filter(isRecord).map((line, index) => {
      const status = isLineStatus(line.status) ? line.status : 'Requested';
      return {
        id: typeof line.id === 'string' ? line.id : `${value.id}-line-${index + 1}`,
        reference: typeof line.reference === 'string' ? line.reference : createLineReference(reference, index + 1),
        vendorId: typeof line.vendorId === 'string' ? line.vendorId : '',
        status,
        ...(typeof line.sentAt === 'string' ? { sentAt: line.sentAt } : {}),
        ...(typeof line.respondedAt === 'string' ? { respondedAt: line.respondedAt } : {}),
        ...(typeof line.insurerQuoteRef === 'string' ? { insurerQuoteRef: line.insurerQuoteRef } : {}),
        ...(typeof line.quotedPremium === 'number' ? { quotedPremium: line.quotedPremium } : {}),
        ...(line.quotedCurrency === 'MVR' || line.quotedCurrency === 'USD' ? { quotedCurrency: line.quotedCurrency } : {}),
        ...(typeof line.quotedRatePct === 'number' ? { quotedRatePct: line.quotedRatePct } : {}),
        ...(typeof line.validUntil === 'string' ? { validUntil: line.validUntil } : {}),
        ...(Array.isArray(line.insurerDeductibles)
          ? { insurerDeductibles: line.insurerDeductibles.filter((entry): entry is string => typeof entry === 'string') }
          : {}),
        ...(Array.isArray(line.insurerWarranties)
          ? { insurerWarranties: line.insurerWarranties.filter(isRecord).flatMap((entry) =>
            typeof entry.title === 'string' && typeof entry.text === 'string'
              ? [{ title: entry.title, text: entry.text }]
              : []) }
          : {}),
        remarks: typeof line.remarks === 'string' ? line.remarks : '',
        statusHistory: normalizeStatusHistory(line.statusHistory),
      } satisfies QuotationRequestLine;
    });
    return {
      id: value.id,
      reference,
      dealId: value.dealId,
      leadId: value.leadId,
      clientId: value.clientId,
      requiredBy: typeof value.requiredBy === 'string' ? value.requiredBy : '',
      insuredAmount: typeof value.insuredAmount === 'number' ? value.insuredAmount
        : typeof value.sumInsured === 'number' ? value.sumInsured : 0,
      currency: value.currency === 'USD' ? 'USD' : 'MVR',
      notes: typeof value.notes === 'string' ? value.notes : '',
      createdBy,
      createdAt,
      updatedAt,
      lines,
    };
  }

  const oldStatus = typeof value.status === 'string' ? value.status : 'Requested';
  const status = legacyStatusMap[oldStatus] ?? 'Requested';
  const vendorIds = Array.isArray(value.vendorIds)
    ? value.vendorIds.filter((vendorId): vendorId is string => typeof vendorId === 'string')
    : [];
  const lines = vendorIds.map((vendorId, index) => ({
    id: `${value.id}-line-${index + 1}`,
    reference: createLineReference(reference, index + 1),
    vendorId,
    status,
    ...(status === 'Sent' ? { sentAt: createdAt } : {}),
    ...(status === 'Quoted' || status === 'Declined' ? { respondedAt: updatedAt } : {}),
    remarks: '',
    statusHistory: [{
      toStatus: status,
      changedAt: createdAt,
      changedBy: createdBy,
    }],
  }));
  return {
    id: value.id,
    reference,
    dealId: value.dealId,
    leadId: value.leadId,
    clientId: value.clientId,
    requiredBy: typeof value.requiredBy === 'string' ? value.requiredBy : '',
    insuredAmount: typeof value.insuredAmount === 'number' ? value.insuredAmount
      : typeof value.sumInsured === 'number' ? value.sumInsured : 0,
    currency: value.currency === 'USD' ? 'USD' : 'MVR',
    notes: typeof value.notes === 'string' ? value.notes : '',
    createdBy,
    createdAt,
    updatedAt,
    lines,
  };
}

export function normalizeQuotationRequests(values: unknown[]) {
  return values.map(normalizeQuotationRequest).filter((request): request is QuotationRequest => Boolean(request));
}
