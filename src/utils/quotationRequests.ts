import type {
  QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus, QuotationRequestLineStatusChange,
  QuotationRequestQuote, QuotationSection, QuotationSectionData,
} from '../types';
import { createQuotationSection, quotationSectionTotal, withSectionTotal } from './quotationSectionTemplates';

export type DerivedQuotationRequestStatus =
  | QuotationRequestLineStatus
  | 'Partially Quoted';

export function getQuotationLineDisplayStatus(line: QuotationRequestLine, now = new Date()): QuotationRequestLineStatus {
  const lastStatusChange = line.statusHistory[line.statusHistory.length - 1];
  const statuses = [line.status, lastStatusChange?.toStatus].filter(
    (status): status is QuotationRequestLineStatus => Boolean(status),
  );
  const precedence: QuotationRequestLineStatus[] = [
    'Cancelled', 'Declined', 'Quoted', 'Expired', 'Sent', 'Requested',
  ];
  const currentStatus = precedence.find((status) => statuses.includes(status));
  if (!currentStatus) return 'Requested';
  if (currentStatus === 'Cancelled' || currentStatus === 'Declined') {
    return currentStatus;
  }
  const underlyingStatus = currentStatus === 'Expired'
    ? [line.status, lastStatusChange?.fromStatus].find((status) => status === 'Sent' || status === 'Quoted')
    : currentStatus;
  if (underlyingStatus !== 'Sent' && underlyingStatus !== 'Quoted') return 'Requested';
  const validityDates = line.quotes.length
    ? line.quotes.map((quote) => quote.validUntil)
    : [line.validUntil];
  const allQuotesExpired = validityDates.length > 0 && validityDates.every((date) => {
    if (!date) return false;
    const expiresAt = Date.parse(`${date.slice(0, 10)}T23:59:59.999Z`);
    return Number.isFinite(expiresAt) && now.getTime() > expiresAt;
  });
  return allQuotesExpired ? 'Expired' : underlyingStatus;
}

export function quotationLineStatusCellText(line: QuotationRequestLine, now = new Date()) {
  const status = getQuotationLineDisplayStatus(line, now);
  if (status === 'Requested' || status === 'Sent') return 'Awaiting quote';
  if (status === 'Declined') return `Declined: ${line.declineReason || line.remarks || 'No reason provided'}`;
  if (status === 'Cancelled') return 'Cancelled';
  if (status === 'Expired') {
    const validityDates = line.quotes.map((quote) => quote.validUntil)
      .filter((date): date is string => Boolean(date)).sort();
    const validityDate = line.quotes.length ? validityDates[validityDates.length - 1] : line.validUntil;
    return `Expired${validityDate ? ` ${validityDate.slice(0, 10)}` : ' (validity date unavailable)'}`;
  }
  return undefined;
}

export function formatQuotationLineReference(line: Pick<QuotationRequestLine, 'reference'>) {
  return line.reference;
}

export function formatQuotationLineActivity(reference: string, message: string) {
  return `${reference} · ${message}`;
}

export function hasActiveQuotationLine(
  lines: QuotationRequestLine[],
  sectionId: string,
  vendorId: string,
) {
  return lines.some((line) => line.sectionId === sectionId
    && line.vendorId === vendorId
    && getQuotationLineDisplayStatus(line) !== 'Cancelled');
}

export function deriveRequestStatus(lines: QuotationRequestLine[]): DerivedQuotationRequestStatus {
  if (!lines.length) return 'Requested';
  const statuses = lines.map((line) => getQuotationLineDisplayStatus(line));
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

export function deriveSectionStatus(sectionId: string, lines: QuotationRequestLine[]) {
  const sectionLines = lines.filter((line) => line.sectionId === sectionId);
  return sectionLines.length > 0 && sectionLines.every((line) => getQuotationLineDisplayStatus(line) === 'Cancelled')
    ? 'Cancelled' as const
    : 'Active' as const;
}

export function createLineReference(batchReference: string, sectionNo: number, lineNo: number) {
  if (!Number.isInteger(sectionNo) || sectionNo < 1 || !Number.isInteger(lineNo) || lineNo < 1) {
    throw new Error('Quotation section and line numbers must be positive integers.');
  }
  return `${batchReference}-${String(sectionNo).padStart(2, '0')}-${String(lineNo).padStart(2, '0')}`;
}

export function nextLineReference(request: QuotationRequest, sectionId: string) {
  const section = request.sections.find((item) => item.id === sectionId);
  if (!section) throw new Error('Cannot create a line for an unknown quotation section.');
  const highestIndex = request.lines.reduce((highest, line) => {
    if (line.sectionId !== sectionId) return highest;
    const match = line.reference.match(/-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return createLineReference(request.reference, section.no, highestIndex + 1);
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

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeQuotes(value: unknown, line: Record<string, unknown>, currency: 'MVR' | 'USD'): QuotationRequestQuote[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord).flatMap((quote, index) => {
      if (!Number.isFinite(quote.premium) || Number(quote.premium) < 0) return [];
      return [{
        optionId: typeof quote.optionId === 'string' ? quote.optionId : `option-${index + 1}`,
        premium: Number(quote.premium),
        currency: quote.currency === 'USD' ? 'USD' : 'MVR',
        ...(typeof quote.ratePct === 'number' ? { ratePct: quote.ratePct } : {}),
        ...(typeof quote.validUntil === 'string' ? { validUntil: quote.validUntil } : {}),
      }];
    });
  }
  if (typeof line.quotedPremium === 'number') {
    return [{
      optionId: 'base',
      premium: line.quotedPremium,
      currency: line.quotedCurrency === 'USD' ? 'USD' : currency,
      ...(typeof line.quotedRatePct === 'number' ? { ratePct: line.quotedRatePct } : {}),
      ...(typeof line.validUntil === 'string' ? { validUntil: line.validUntil } : {}),
    }];
  }
  return [];
}

function normalizeSectionData(value: unknown, fallback: QuotationSectionData): QuotationSectionData {
  if (!isRecord(value)) return fallback;
  const data = { ...fallback, ...value } as unknown as QuotationSectionData;
  const interests = Array.isArray(value.interests)
    ? value.interests.filter(isRecord).map((item) => ({
      interest: typeof item.interest === 'string' ? item.interest : '',
      sumInsured: finiteNumber(item.sumInsured),
    }))
    : fallback.interests;
  const businessInterruption = isRecord(value.businessInterruption)
    ? {
      grossProfit: finiteNumber(value.businessInterruption.grossProfit),
      indemnityMonths: finiteNumber(value.businessInterruption.indemnityMonths, 12),
    }
    : fallback.businessInterruption;
  const options = Array.isArray(value.options)
    ? value.options.filter(isRecord).map((option, index) => ({
      id: typeof option.id === 'string' ? option.id : `option-${index + 1}`,
      label: typeof option.label === 'string' ? option.label : `Option ${index + 1}`,
      coverages: Array.isArray(option.coverages) ? option.coverages.filter(isRecord).map((coverage) => ({
        name: typeof coverage.name === 'string' ? coverage.name : '',
        limit: finiteNumber(coverage.limit),
      })) : [],
    }))
    : fallback.options;
  const materialInfo = isRecord(value.materialInfo)
    ? Object.fromEntries(Object.entries(value.materialInfo)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : fallback.materialInfo;
  return withSectionTotal({
    ...fallback,
    ...data,
    interests,
    ...(businessInterruption ? { businessInterruption } : {}),
    deductibles: Array.isArray(value.deductibles)
      ? value.deductibles.filter((item): item is string => typeof item === 'string')
      : fallback.deductibles,
    extensions: Array.isArray(value.extensions) ? value.extensions.filter(isRecord).map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      limit: typeof item.limit === 'string' ? item.limit : String(item.limit ?? ''),
    })) : fallback.extensions,
    materialInfo,
    options,
  });
}

function legacySection(requestId: string, value: Record<string, unknown>, amount: number): QuotationSection {
  const productCode = typeof value.productCode === 'string' ? value.productCode
    : typeof value.product === 'string' ? value.product : 'GENERAL';
  const productName = typeof value.productName === 'string' ? value.productName
    : typeof value.product === 'string' ? value.product : 'Insured interest';
  const section = createQuotationSection(`${requestId}-section-01`, 1, { code: productCode, name: productName });
  const data = section.data;
  if (data.businessInterruption) {
    data.businessInterruption.grossProfit = amount;
  } else if (data.options.length) {
    data.options[0].coverages[0].limit = amount;
  } else if (data.interests.length) {
    data.interests[0].sumInsured = amount;
  } else if (amount > 0) {
    data.interests.push({ interest: productName, sumInsured: amount });
  }
  section.data = withSectionTotal(data);
  return section;
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

function normalizeBatchReference(value: string) {
  const current = value.match(/^QRS-(\d+)-(\d{4})$/);
  if (current) return `QRS-${String(Number(current[1])).padStart(3, '0')}-${current[2]}`;
  const legacy = value.match(/^(?:QR|QRS)-(\d{4})-(\d+)$/);
  if (legacy) return `QRS-${String(Number(legacy[2])).padStart(3, '0')}-${legacy[1]}`;
  return value;
}

function normalizeLineReference(value: unknown, batchReference: string, sectionNo: number, lineNo: number) {
  if (typeof value !== 'string') return createLineReference(batchReference, sectionNo, lineNo);
  const escapedBatch = batchReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escapedBatch}-\\d{2,}-\\d{2,}$`).test(value)) return value;
  const lastNumber = value.match(/-(\d+)$/);
  return createLineReference(batchReference, sectionNo, lastNumber ? Math.max(1, Number(lastNumber[1])) : lineNo);
}

export function normalizeQuotationRequest(value: unknown): QuotationRequest | null {
  if (!isRecord(value)) return null;
  const rawReference = typeof value.reference === 'string'
    ? value.reference
    : typeof value.ref === 'string' ? value.ref : '';
  if (!rawReference || typeof value.id !== 'string' || typeof value.dealId !== 'string'
    || typeof value.leadId !== 'string' || typeof value.clientId !== 'string') return null;
  const reference = normalizeBatchReference(rawReference);
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString();
  const issuedAt = typeof value.issuedAt === 'string' ? value.issuedAt : createdAt.slice(0, 10);
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  const preparedBy = typeof value.preparedBy === 'string'
    ? value.preparedBy
    : typeof value.createdBy === 'string' ? value.createdBy : '';
  const currency = value.currency === 'USD' ? 'USD' : 'MVR';
  const amount = finiteNumber(value.insuredAmount, finiteNumber(value.sumInsured));
  const rawSections = Array.isArray(value.sections) ? value.sections.filter(isRecord) : [];
  const sections = rawSections.length
    ? rawSections.map((rawSection, index) => {
      const no = Number.isInteger(rawSection.no) && Number(rawSection.no) > 0 ? Number(rawSection.no) : index + 1;
      const id = typeof rawSection.id === 'string' ? rawSection.id : `${value.id}-section-${String(no).padStart(2, '0')}`;
      const productCode = typeof rawSection.productCode === 'string' ? rawSection.productCode : 'GENERAL';
      const title = typeof rawSection.title === 'string' ? rawSection.title : productCode;
      const fallback = createQuotationSection(id, no, { code: productCode, name: title });
      return {
        ...fallback,
        ...rawSection,
        id,
        no,
        productCode,
        title,
        status: rawSection.status === 'Cancelled' ? 'Cancelled' : 'Active',
        data: normalizeSectionData(rawSection.data, fallback.data),
      } satisfies QuotationSection;
    })
    : [legacySection(value.id, value, amount)];
  const rawLines = Array.isArray(value.lines) ? value.lines.filter(isRecord) : [];
  const legacyStatus = typeof value.status === 'string' ? value.status : 'Requested';
  const defaultStatus = legacyStatusMap[legacyStatus] ?? 'Requested';
  const rawVendorIds = Array.isArray(value.vendorIds)
    ? value.vendorIds.filter((vendorId): vendorId is string => typeof vendorId === 'string')
    : [];
  const lineValues: Record<string, unknown>[] = rawLines.length
    ? rawLines
    : rawVendorIds.map((vendorId) => ({ vendorId, status: defaultStatus }));
  const lines = lineValues.map((line, index) => {
    const section = sections.find((item) => item.id === line.sectionId) ?? sections[0];
    const status = isLineStatus(line.status) ? line.status : defaultStatus;
    const lineId = typeof line.id === 'string' ? line.id : `${value.id}-line-${index + 1}`;
    const lineReference = normalizeLineReference(line.reference, reference, section.no, index + 1);
    const quotes = normalizeQuotes(line.quotes, line, currency);
    return {
      id: lineId,
      reference: lineReference,
      sectionId: section.id,
      vendorId: typeof line.vendorId === 'string' ? line.vendorId : '',
      status,
      ...(typeof line.sentAt === 'string' ? { sentAt: line.sentAt } : {}),
      ...(typeof line.respondedAt === 'string' ? { respondedAt: line.respondedAt } : {}),
      ...(typeof line.insurerQuoteRef === 'string' ? { insurerQuoteRef: line.insurerQuoteRef } : {}),
      quotes,
      ...(typeof line.declineReason === 'string' ? { declineReason: line.declineReason } : {}),
      ...(quotes[0] ? {
        quotedPremium: quotes[0].premium,
        quotedCurrency: quotes[0].currency,
        ...(quotes[0].ratePct === undefined ? {} : { quotedRatePct: quotes[0].ratePct }),
        ...(quotes[0].validUntil ? { validUntil: quotes[0].validUntil } : {}),
      } : typeof line.quotedPremium === 'number' ? { quotedPremium: line.quotedPremium } : {}),
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

  for (const section of sections) {
    if (!lineValues.length) section.status = 'Active';
    else section.status = deriveSectionStatus(section.id, lines);
  }
  return {
    id: value.id,
    reference,
    issuedAt,
    dealId: value.dealId,
    leadId: value.leadId,
    clientId: value.clientId,
    insuredName: typeof value.insuredName === 'string' ? value.insuredName
      : typeof value.client === 'string' ? value.client : '',
    businessActivity: typeof value.businessActivity === 'string' ? value.businessActivity : '',
    additionalActivity: typeof value.additionalActivity === 'string' ? value.additionalActivity : '',
    riskLocation: typeof value.riskLocation === 'string' ? value.riskLocation : '',
    territorialLimits: typeof value.territorialLimits === 'string' ? value.territorialLimits : '',
    occupation: typeof value.occupation === 'string' ? value.occupation : '',
    periodOfInsurance: typeof value.periodOfInsurance === 'string' && value.periodOfInsurance
      ? value.periodOfInsurance : 'TBA',
    requiredBy: typeof value.requiredBy === 'string' ? value.requiredBy : '',
    currency,
    notes: typeof value.notes === 'string' ? value.notes : '',
    preparedBy,
    checkedBy: typeof value.checkedBy === 'string' ? value.checkedBy : '',
    createdAt,
    updatedAt,
    sections,
    lines,
  };
}

export function normalizeQuotationRequests(values: unknown[]) {
  return values.map(normalizeQuotationRequest).filter((request): request is QuotationRequest => Boolean(request));
}

export { quotationSectionTotal };
