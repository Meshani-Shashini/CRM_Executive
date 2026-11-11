import type {
  ClientQuotation, ClientQuotationStatus, QuotationRequest, QuotationRequestLine, Role,
} from '../types';

const DAY_MS = 86400000;

export function defaultQuotationValidUntil(issuedAt: string, validityDays: number) {
  const issuedTimestamp = Date.parse(issuedAt);
  if (!Number.isFinite(issuedTimestamp) || !Number.isInteger(validityDays) || validityDays < 1) {
    throw new Error('Quotation issue date and validity days must be valid.');
  }
  return new Date(issuedTimestamp + validityDays * DAY_MS).toISOString().slice(0, 10);
}

export function isQuotationExpired(quotation: Pick<ClientQuotation, 'validUntil' | 'status'>, now = new Date()) {
  if (quotation.status === 'Accepted' || quotation.status === 'Rejected' || quotation.status === 'Superseded') return false;
  const validUntil = Date.parse(`${quotation.validUntil.slice(0, 10)}T23:59:59.999Z`);
  return Number.isFinite(validUntil) && now.getTime() > validUntil;
}

export function quotationTotalSumInsured(quotation: Pick<ClientQuotation, 'sections'>) {
  return quotation.sections.reduce((total, section) =>
    total + section.items.reduce((subtotal, item) => subtotal + (Number.isFinite(item.sumInsured) ? item.sumInsured : 0), 0), 0);
}

export function quotationRatePct(proposedPremium: number, totalSumInsured: number) {
  return totalSumInsured > 0 && proposedPremium > 0
    ? Math.round((proposedPremium / totalSumInsured) * 10000) / 100
    : 0;
}

export function canTransitionClientQuotation(
  current: ClientQuotationStatus,
  next: ClientQuotationStatus,
  role: Role,
  expired = false,
) {
  if (current === next) return false;
  if (next === 'Accepted' || next === 'Rejected') {
    if (current === 'Issued') return (role === 'admin' || role === 'sales' || role === 'client')
      && (next !== 'Accepted' || !expired);
  }
  if (role !== 'admin' && role !== 'sales') return false;
  if (current === 'Draft') return next === 'Issued' || next === 'Superseded';
  if (current === 'Issued') {
    return next === 'Expired' && expired || next === 'Superseded';
  }
  return false;
}

export function validateClientQuotation(quotation: ClientQuotation, differentAuthorizerRequired: boolean) {
  const errors: string[] = [];
  const total = quotationTotalSumInsured(quotation);
  if (!Number.isFinite(quotation.proposedPremium) || quotation.proposedPremium <= 0) errors.push('Proposed premium must be positive.');
  if (!Number.isFinite(total) || total <= 0) errors.push('Total sum insured must be positive.');
  if (!quotation.validUntil || !Number.isFinite(Date.parse(quotation.validUntil))) errors.push('A valid quotation expiry date is required.');
  else if (Date.parse(`${quotation.validUntil.slice(0, 10)}T23:59:59.999Z`) <= Date.now()) errors.push('Quotation expiry must be in the future.');
  if (!quotation.addressee.contactId.trim() || !quotation.addressee.name.trim()) {
    errors.push('Select a contact as the quotation addressee.');
  }
  if (!quotation.preparedBy.trim() || !quotation.authorizedBy.trim()) errors.push('Prepared by and authorized by are required.');
  if (differentAuthorizerRequired && quotation.preparedBy === quotation.authorizedBy) {
    errors.push('The authorizer must be different from the preparer.');
  }
  if (!quotation.sections.some((section) => section.items.some((item) => item.interest.trim() && item.sumInsured > 0))) {
    errors.push('Add at least one insured interest with a positive sum insured.');
  }
  return errors;
}

export function createClientQuotationDraft(input: {
  id: string;
  reference: string;
  version?: number;
  request: QuotationRequest;
  line: QuotationRequestLine;
  deal: { id: string; leadId: string; clientId?: string; client: string; product: string; productCode?: string; value: number; currency: 'MVR' | 'USD'; insurer: string; contactName?: string; contactRole?: string; closeDate?: string };
  addressee: { contactId: string; name: string; designation: string };
  preparedBy: string;
  authorizedBy: string;
  validityDays: number;
  now?: string;
  template?: {
    perils?: string[];
    deductibles?: Array<{ label: string; text: string }>;
    warranties?: Array<{ title: string; text: string }>;
    exclusions?: string[];
    disclaimer?: string;
    communicableDiseaseExclusion?: string;
    sanctionClause?: string;
  };
}): ClientQuotation {
  const { request, line, deal } = input;
  if (line.status !== 'Quoted') throw new Error('A client quotation can only be created from a Quoted QRS line.');
  const now = input.now ?? new Date().toISOString();
  const validUntil = line.validUntil ?? defaultQuotationValidUntil(now, input.validityDays);
  const sumInsured = deal.value;
  const template = input.template ?? {};
  const sections = [{ title: 'Insured Interest', items: [{ interest: deal.product, sumInsured }] }];
  const conditions = [
    ...(template.communicableDiseaseExclusion ? [template.communicableDiseaseExclusion] : []),
    ...(template.sanctionClause ? [template.sanctionClause] : []),
  ];
  return {
    id: input.id,
    reference: input.reference,
    dealId: deal.id,
    leadId: deal.leadId,
    clientId: deal.clientId ?? request.clientId,
    sourceRequestId: request.id,
    sourceLineId: line.id,
    version: input.version ?? 1,
    status: 'Draft',
    validUntil,
    validUntilOverridden: Boolean(line.validUntil),
    addressee: input.addressee,
    policyNo: 'TBA',
    endorsementNo: 'Not applicable',
    policyPeriod: '',
    territorialLimits: '',
    occupation: deal.product,
    riskLocation: '',
    sections,
    totalSumInsured: sumInsured,
    currency: line.quotedCurrency ?? deal.currency,
    perils: [...(template.perils ?? [])],
    extensions: [],
    deductibles: [
      ...(line.insurerDeductibles ?? []).map((text) => ({ label: 'Insurer deductible', text })),
      ...(template.deductibles ?? []),
    ],
    warranties: [...(line.insurerWarranties ?? []), ...(template.warranties ?? [])],
    conditions,
    exclusions: [...(template.exclusions ?? [])],
    disclaimer: template.disclaimer ?? '',
    proposedPremium: line.quotedPremium ?? 0,
    ratePct: line.quotedRatePct ?? quotationRatePct(line.quotedPremium ?? 0, sumInsured),
    preparedBy: input.preparedBy,
    authorizedBy: input.authorizedBy,
  };
}

export function findQuotedSourceLine(
  requests: QuotationRequest[],
  requestId: string,
  lineId: string,
) {
  const request = requests.find((entry) => entry.id === requestId);
  const line = request?.lines.find((entry) => entry.id === lineId);
  return request && line?.status === 'Quoted' ? { request, line } : undefined;
}
