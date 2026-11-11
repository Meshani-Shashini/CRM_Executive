import type {
  ClientQuotation, ClientQuotationSection, ClientQuotationSource, ClientQuotationStatus,
  QuotationRequest, QuotationRequestLine, QuotationRequestQuote, QuotationSection,
  Role,
} from '../types';

const DAY_MS = 86400000;

export type ClientQuotationClauseSet = {
  perils: string[];
  deductibles: Array<{ label: string; text: string }>;
  warranties: Array<{ title: string; text: string }>;
  exclusions: string[];
  conditions?: string[];
  disclaimer: string;
  communicableDiseaseExclusion: string;
  sanctionClause: string;
};

function dateOnlyEnd(value: string) {
  const timestamp = Date.parse(`${value.slice(0, 10)}T23:59:59.999Z`);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function defaultQuotationValidUntil(issuedAt: string, validityDays: number) {
  const issuedTimestamp = Date.parse(issuedAt);
  if (!Number.isFinite(issuedTimestamp) || !Number.isInteger(validityDays) || validityDays < 1) {
    throw new Error('Quotation issue date and validity days must be valid.');
  }
  return new Date(issuedTimestamp + validityDays * DAY_MS).toISOString().slice(0, 10);
}

export function isQuotationExpired(quotation: Pick<ClientQuotation, 'validUntil' | 'status'>, now = new Date()) {
  if (quotation.status === 'Accepted' || quotation.status === 'Rejected' || quotation.status === 'Superseded') return false;
  const validUntil = dateOnlyEnd(quotation.validUntil);
  return Number.isFinite(validUntil) && now.getTime() > validUntil;
}

export function quotationTotalSumInsured(quotation: Pick<ClientQuotation, 'sections'>) {
  return quotation.sections.reduce((total, section) =>
    total + (Number.isFinite(section.totalSumInsured) ? section.totalSumInsured : 0), 0);
}

export function quotationTotalPremium(quotation: Pick<ClientQuotation, 'sections'>) {
  return quotation.sections.reduce((total, section) =>
    total + (Number.isFinite(section.proposedPremium) ? section.proposedPremium : 0), 0);
}

export function quotationRatePct(proposedPremium: number, totalSumInsured: number) {
  return totalSumInsured > 0 && proposedPremium > 0
    ? Math.round((proposedPremium / totalSumInsured) * 10000) / 100
    : 0;
}

export function quoteForSource(
  line: QuotationRequestLine,
  optionKey?: string,
): QuotationRequestQuote | undefined {
  return optionKey
    ? line.quotes.find((quote) => quote.optionId === optionKey)
    : line.quotes[0];
}

export function getSourceValidityWarnings(
  quotation: Pick<ClientQuotation, 'requestId' | 'sources' | 'validUntil'>,
  requests: QuotationRequest[],
  now = new Date(),
) {
  const request = requests.find((entry) => entry.id === quotation.requestId);
  if (!request) return ['The source quotation request is unavailable.'];
  const warnings: string[] = [];
  for (const source of quotation.sources) {
    const line = request.lines.find((entry) => entry.id === source.lineId);
    const quote = line && quoteForSource(line, source.optionKey);
    if (!line || !quote) continue;
    const sourceExpiry = quote.validUntil ? dateOnlyEnd(quote.validUntil) : Number.NaN;
    if (Number.isFinite(sourceExpiry) && sourceExpiry < now.getTime()) {
      warnings.push(`${line.reference}${source.optionKey ? ` (${source.optionKey})` : ''} has an expired quote.`);
    } else if (Number.isFinite(sourceExpiry) && sourceExpiry < dateOnlyEnd(quotation.validUntil)) {
      warnings.push(`${line.reference}${source.optionKey ? ` (${source.optionKey})` : ''} expires before the client quotation.`);
    }
  }
  return [...new Set(warnings)];
}

export function sourceValidityConfirmationRequired(
  quotation: Pick<ClientQuotation, 'requestId' | 'sources' | 'validUntil'>,
  requests: QuotationRequest[],
  now = new Date(),
) {
  return getSourceValidityWarnings(quotation, requests, now).length > 0;
}

export function canTransitionClientQuotation(
  current: ClientQuotationStatus,
  next: ClientQuotationStatus,
  role: Role,
  expired = false,
) {
  if ((role !== 'admin' && role !== 'sales') || current === next) return false;
  if (next === 'Accepted' || next === 'Rejected') return current === 'Issued' && (next !== 'Accepted' || !expired);
  if (current === 'Draft') return next === 'Issued' || next === 'Superseded';
  if (current === 'Issued') return next === 'Expired' && expired || next === 'Superseded';
  return false;
}

function sourcesAreComplete(
  quotation: ClientQuotation,
  request: QuotationRequest,
  errors: string[],
) {
  for (const section of quotation.sections) {
    const sourceList = quotation.sources.filter((source) => source.sectionId === section.sectionId);
    const qrsSection = request.sections.find((entry) => entry.id === section.sectionId);
    if (!qrsSection || qrsSection.status !== 'Active') {
      errors.push(`${section.title} is not an active section in the source request.`);
      continue;
    }
    const optionKeys = qrsSection.data.options.map((option) => option.id);
    const expected = optionKeys.length ? optionKeys : [undefined];
    if (sourceList.length !== expected.length) {
      errors.push(`${section.title} must have exactly one quoted source${optionKeys.length ? ' per option' : ''}.`);
    }
    const seen = new Set<string>();
    for (const optionKey of expected) {
      const source = sourceList.find((item) => item.optionKey === optionKey);
      if (!source || seen.has(optionKey ?? '')) {
        errors.push(`${section.title} is missing a unique quoted source${optionKey ? ` for ${optionKey}` : ''}.`);
        continue;
      }
      seen.add(optionKey ?? '');
      const line = request.lines.find((entry) => entry.id === source.lineId);
      const quote = line && quoteForSource(line, optionKey);
      if (!line || line.sectionId !== section.sectionId || line.status !== 'Quoted' || !quote) {
        errors.push(`${section.title} requires a matching QRS line in Quoted status${optionKey ? ` for ${optionKey}` : ''}.`);
        continue;
      }
      if (!Number.isFinite(quote.premium) || quote.premium <= 0) {
        errors.push(`${section.title} source premium must be positive.`);
      }
      if (quote.currency !== quotation.currency) {
        errors.push('All selected carrier quotes must use the same currency.');
      }
    }
  }
  if (quotation.sources.some((source) => !quotation.sections.some((section) => section.sectionId === source.sectionId))) {
    errors.push('Every source line must belong to an included section.');
  }
}

export function validateClientQuotation(
  quotation: ClientQuotation,
  request: QuotationRequest | undefined,
  differentAuthorizerRequired: boolean,
  options: { forIssue?: boolean; confirmSourceValidity?: boolean; now?: Date } = {},
) {
  const errors: string[] = [];
  if (!request || request.id !== quotation.requestId) {
    errors.push('A valid source quotation request is required.');
  } else {
    if (request.dealId !== quotation.dealId || request.leadId !== quotation.leadId || request.clientId !== quotation.clientId) {
      errors.push('The quotation must match the source request deal, lead, and client.');
    }
    sourcesAreComplete(quotation, request, errors);
    if (!options.confirmSourceValidity) {
      errors.push(...getSourceValidityWarnings(quotation, [request], options.now));
    }
  }
  if (!quotation.sections.length) errors.push('Include at least one QRS section.');
  for (const section of quotation.sections) {
    if (!section.interests.some((interest) => interest.interest.trim() && Number.isFinite(interest.sumInsured) && interest.sumInsured > 0)
      && !(section.businessInterruption && section.businessInterruption.grossProfit > 0)
      && section.totalSumInsured <= 0) {
      errors.push(`${section.title} must have a positive sum insured.`);
    }
    if (!Number.isFinite(section.proposedPremium) || section.proposedPremium <= 0) {
      errors.push(`${section.title} proposed premium must be positive.`);
    }
  }
  if (quotationTotalSumInsured(quotation) <= 0) errors.push('Total sum insured must be positive.');
  if (quotationTotalPremium(quotation) <= 0) errors.push('Total premium must be positive.');
  if (!quotation.addressee.contactId.trim() || !quotation.addressee.name.trim()) {
    errors.push('Select a contact as the quotation addressee.');
  }
  if (!quotation.preparedBy.trim()) errors.push('Prepared by is required.');
  if (options.forIssue && !quotation.authorizedBy.trim()) errors.push('Authorized by is required before issue.');
  if (options.forIssue && differentAuthorizerRequired
    && quotation.preparedBy && quotation.preparedBy === quotation.authorizedBy) {
    errors.push('The authorizer must be different from the preparer.');
  }
  const issueDate = quotation.issuedAt ? Date.parse(quotation.issuedAt) : Number.NaN;
  const validUntil = Date.parse(`${quotation.validUntil}T00:00:00`);
  if (!Number.isFinite(issueDate) || !Number.isFinite(validUntil) || issueDate > validUntil) {
    errors.push('Issue date must be on or before a valid quotation expiry date.');
  }
  if (options.forIssue && Number.isFinite(dateOnlyEnd(quotation.validUntil))
    && dateOnlyEnd(quotation.validUntil) < (options.now ?? new Date()).getTime()) {
    errors.push('Quotation expiry must be in the future before issue.');
  }
  return [...new Set(errors)];
}

export function createClientQuotationDraft(input: {
  id: string;
  reference: string;
  request: QuotationRequest;
  sources: ClientQuotationSource[];
  deal: {
    id: string;
    leadId: string;
    clientId?: string;
    client: string;
    product: string;
    productCode?: string;
    value: number;
    currency: 'MVR' | 'USD';
    insurer: string;
    contactName?: string;
    contactRole?: string;
    closeDate?: string;
  };
  addressee: { contactId: string; name: string; designation: string };
  preparedBy: string;
  authorizedBy: string;
  validityDays: number;
  now?: string;
  clausesForSection: (section: QuotationSection) => ClientQuotationClauseSet;
}): ClientQuotation {
  const { request, deal } = input;
  const now = input.now ?? new Date().toISOString();
  const validUntil = defaultQuotationValidUntil(now, input.validityDays);
  const includedSections = request.sections.filter((section) =>
    input.sources.some((source) => source.sectionId === section.id));
  const firstSection = includedSections[0];
  if (!firstSection) throw new Error('Include at least one active QRS section.');
  const currencies = new Set<string>();

  const sections: ClientQuotationSection[] = includedSections.map((section) => {
    const sectionSources = input.sources.filter((source) => source.sectionId === section.id);
    const quoteEntries = sectionSources.map((source) => {
      const line = request.lines.find((entry) => entry.id === source.lineId);
      const quote = line && quoteForSource(line, source.optionKey);
      if (!line || line.status !== 'Quoted' || !quote) {
        throw new Error(`Select a Quoted QRS line for ${section.title}${source.optionKey ? ` (${source.optionKey})` : ''}.`);
      }
      currencies.add(quote.currency);
      const optionLabel = section.data.options.find((option) => option.id === source.optionKey)?.label ?? '';
      return { line, quote, source, optionLabel };
    });
    const first = quoteEntries[0];
    if (!first) throw new Error(`Select at least one quoted source for ${section.title}.`);
    const optionQuotes = quoteEntries.filter((entry) => entry.source.optionKey).map(({ line, quote, source, optionLabel }) => ({
      optionKey: source.optionKey!,
      label: optionLabel || source.optionKey!,
      proposedPremium: quote.premium,
      ratePct: quotationRatePct(quote.premium, section.data.totalSumInsured),
      insurerLineReference: line.reference,
      sourceValidUntil: quote.validUntil,
    }));
    const baseQuote = optionQuotes.length
      ? [...optionQuotes].sort((a, b) => a.proposedPremium - b.proposedPremium)[0]
      : {
        proposedPremium: first.quote.premium,
        ratePct: quotationRatePct(first.quote.premium, section.data.totalSumInsured),
        insurerLineReference: first.line.reference,
      };
    const clauses = input.clausesForSection(section);
    return {
      sectionId: section.id,
      productCode: section.productCode,
      title: section.title,
      interests: section.data.interests.map((interest) => ({ ...interest })),
      businessInterruption: section.data.businessInterruption ? { ...section.data.businessInterruption } : undefined,
      totalSumInsured: section.data.totalSumInsured,
      perils: [...clauses.perils],
      extensions: section.data.extensions.map((extension) => ({ ...extension })),
      deductibles: [
        ...section.data.deductibles.map((text) => ({ label: 'Section deductible', text })),
        ...quoteEntries.flatMap(({ line }) => (line.insurerDeductibles ?? []).map((text) => ({ label: 'Insurer deductible', text }))),
        ...clauses.deductibles.map((item) => ({ ...item })),
      ],
      warranties: [
        ...quoteEntries.flatMap(({ line }) => (line.insurerWarranties ?? []).map((item) => ({ ...item }))),
        ...clauses.warranties.map((item) => ({ ...item })),
      ],
      conditions: [
        ...(clauses.conditions ?? []),
        ...(clauses.communicableDiseaseExclusion ? [clauses.communicableDiseaseExclusion] : []),
        ...(clauses.sanctionClause ? [clauses.sanctionClause] : []),
      ],
      exclusions: [...clauses.exclusions],
      proposedPremium: baseQuote.proposedPremium,
      ratePct: baseQuote.ratePct,
      insurerLineReference: baseQuote.insurerLineReference,
      sourceValidUntil: optionQuotes.length
        ? optionQuotes.find((option) => option.proposedPremium === baseQuote.proposedPremium)?.sourceValidUntil
        : first.quote.validUntil,
      optionQuotes,
    };
  });
  if (currencies.size > 1) throw new Error('Selected carrier quotations must use the same currency.');
  const clientQuotation: ClientQuotation = {
    id: input.id,
    reference: input.reference,
    version: 1,
    status: 'Draft',
    dealId: deal.id,
    leadId: request.leadId,
    clientId: request.clientId,
    requestId: request.id,
    sources: input.sources.map((source) => ({ ...source })),
    addressee: { ...input.addressee },
    policyNo: 'TBA',
    endorsementNo: 'Not applicable',
    policyPeriod: 'One year from the date of confirmation',
    territorialLimits: request.territorialLimits,
    occupation: request.occupation || request.businessActivity || deal.product,
    riskLocation: request.riskLocation,
    insuredName: request.insuredName || deal.client,
    currency: [...currencies][0] === 'USD' ? 'USD' : [...currencies][0] === 'MVR' ? 'MVR' : deal.currency,
    sections,
    totalPremium: quotationTotalPremium({ sections }),
    totalSumInsured: quotationTotalSumInsured({ sections }),
    issuedAt: now,
    validityDays: input.validityDays,
    validUntil,
    disclaimer: input.clausesForSection(firstSection).disclaimer,
    preparedBy: input.preparedBy,
    authorizedBy: input.authorizedBy,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ toStatus: 'Draft', changedAt: now, changedBy: input.preparedBy }],
    sourceValidityConfirmed: false,
  };
  return clientQuotation;
}

export function findQuotedSourceLine(requests: QuotationRequest[], requestId: string, lineId: string) {
  const request = requests.find((entry) => entry.id === requestId);
  const line = request?.lines.find((entry) => entry.id === lineId);
  return request && line?.status === 'Quoted' ? { request, line } : undefined;
}

export function buildClientQuotationSources(
  request: QuotationRequest,
  sectionIds: string[],
  selectedLineByOption: Record<string, string>,
) {
  const sources: ClientQuotationSource[] = [];
  for (const sectionId of sectionIds) {
    const section = request.sections.find((entry) => entry.id === sectionId);
    if (!section) throw new Error('An included section does not exist in the source request.');
    const optionKeys = section.data.options.map((option) => option.id);
    const keys = optionKeys.length ? optionKeys : [''];
    for (const optionKey of keys) {
      const selectionKey = `${sectionId}:${optionKey}`;
      const lineId = selectedLineByOption[selectionKey];
      const line = request.lines.find((entry) => entry.id === lineId && entry.sectionId === sectionId && entry.status === 'Quoted');
      if (!line || !quoteForSource(line, optionKey || undefined)) {
        throw new Error(`Choose a quoted carrier line for ${section.title}${optionKey ? `, option ${optionKey}` : ''}.`);
      }
      sources.push({ sectionId, lineId, ...(optionKey ? { optionKey } : {}) });
    }
  }
  return sources;
}

export function defaultLowestPremiumSelections(request: QuotationRequest) {
  const selections: Record<string, string> = {};
  for (const section of request.sections) {
    if (section.status !== 'Active') continue;
    const optionKeys = section.data.options.map((option) => option.id);
    for (const optionKey of (optionKeys.length ? optionKeys : [''])) {
      const candidates = request.lines.flatMap((line) => {
        if (line.sectionId !== section.id || line.status !== 'Quoted') return [];
        const quote = quoteForSource(line, optionKey || undefined);
        return quote ? [{ line, quote }] : [];
      }).sort((left, right) => left.quote.premium - right.quote.premium);
      if (candidates[0]) selections[`${section.id}:${optionKey}`] = candidates[0].line.id;
    }
  }
  return selections;
}

export function calculateSectionTotal(section: Pick<ClientQuotationSection, 'interests' | 'businessInterruption'>) {
  const interestTotal = section.interests.reduce((sum, interest) =>
    sum + (Number.isFinite(interest.sumInsured) ? interest.sumInsured : 0), 0);
  return interestTotal || section.businessInterruption?.grossProfit || 0;
}

export function quotationSection(request: QuotationRequest, sectionId: string): QuotationSection | undefined {
  return request.sections.find((section) => section.id === sectionId);
}
