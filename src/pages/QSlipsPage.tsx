import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Plus, Search, Send, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import DateInput from '../components/ui/DateInput';
import Modal from '../components/ui/Modal';
import QuotationRequestDetailWorkspace from '../components/quotationRequest/QuotationRequestDetailWorkspace';
import { useApp } from '../store/AppContext';
import type {
  Client, Deal, Lead, QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus,
  QuotationRequestQuote, QuotationSection,
} from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import { isTerminalDealStage } from '../utils/stageSla';
import { dashboardHref, hashParams } from '../utils/navigation';
import {
  canTransitionQuotationRequestStatus, quotationRequestStatusOptions,
} from '../utils/quotationRequestStatus';
import {
  createLineReference, deriveRequestStatus, deriveSectionStatus, formatQuotationLineActivity,
  formatQuotationLineReference, getQuotationLineDisplayStatus, hasActiveQuotationLine, hasDuplicateQuotationReferences,
  nextLineReference, quotationSectionTotal,
} from '../utils/quotationRequests';
import { createQuotationSection, validateQuotationSection, withSectionTotal } from '../utils/quotationSectionTemplates';
import { getNextReference } from '../utils/references';

const STATUSES: QuotationRequestLineStatus[] = ['Requested', 'Sent', 'Quoted', 'Declined', 'Expired', 'Cancelled'];

function resolveDealClient(deal: Deal, clients: ReturnType<typeof useApp>['clients']) {
  return clients.find((client) => client.id === deal.clientId)
    ?? clients.find((client) => client.name.trim().toLowerCase() === deal.client.trim().toLowerCase());
}

function resolveRequestContext(request: QuotationRequest, deals: Deal[], clients: Client[], leads: Lead[]) {
  const deal = deals.find((item) => item.id === request.dealId);
  const lead = leads.find((item) => item.id === request.leadId)
    ?? leads.find((item) => item.dealId === request.dealId);
  const leadClientName = lead?.client.trim().toLowerCase();
  const client = clients.find((item) => item.id === request.clientId)
    ?? (deal ? resolveDealClient(deal, clients) : undefined)
    ?? clients.find((item) => item.id === lead?.clientId)
    ?? clients.find((item) => item.name.trim().toLowerCase() === leadClientName);
  const clientName = [client?.name, lead?.client, deal?.client]
    .find((name) => name?.trim())?.trim() ?? 'Client unavailable';
  return {
    deal,
    lead,
    client,
    clientName,
    leadDetail: [lead?.title, lead?.client, deal?.client]
      .find((detail) => detail?.trim())?.trim() ?? 'Lead details unavailable',
    leadIdentifier: lead?.id || request.leadId || 'Lead unavailable',
  };
}

function statusTone(status: ReturnType<typeof deriveRequestStatus>): 'muted' | 'brand' | 'warm' | 'win' {
  if (status === 'Quoted') return 'win';
  if (status === 'Partially Quoted' || status === 'Declined') return 'warm';
  if (status === 'Sent') return 'brand';
  return 'muted';
}

export default function QSlipsPage() {
  const {
    clients, deals, leads, pipelineStages, quotationRequests, setQuotationRequests, dataReady,
    vendors, products, user, viewAsRole, setActivities,
  } = useApp();
  const activeRole = viewAsRole ?? user.role;
  const canEdit = user.role === 'admin' || activeRole === 'admin' || activeRole === 'sales';
  const insurerOptions = vendors.filter((vendor) =>
    ['Insurer', 'Reinsurer'].includes(vendor.vendorType) && vendor.status === 'active',
  );
  const openDeals = deals.filter((deal) => !isTerminalDealStage(
    deal.stage,
    deal.disposition,
    pipelineStages.find((stage) => stage.pipelineId === deal.pipelineId && stage.name === deal.stage),
  ));
  const [open, setOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [wizardStep, setWizardStep] = useState(0);
  const [riskDetails, setRiskDetails] = useState({
    issuedAt: '', insuredName: '', businessActivity: '', additionalActivity: '', riskLocation: '',
    territorialLimits: '', occupation: '', periodOfInsurance: 'TBA', requiredBy: '',
    currency: 'MVR' as 'MVR' | 'USD', notes: '', preparedBy: '', checkedBy: '',
  });
  const [draftSections, setDraftSections] = useState<QuotationSection[]>([]);
  const draftSectionsRef = useRef<QuotationSection[]>([]);
  const [sectionInsurers, setSectionInsurers] = useState<Record<string, string[]>>({});
  const [sectionInterestInputs, setSectionInterestInputs] = useState<Record<string, string>>({});
  const [sectionProductCode, setSectionProductCode] = useState('');
  const [formError, setFormError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [dealFilter, setDealFilter] = useState('');
  const [requestFilter, setRequestFilter] = useState('');
  const [detailRequestId, setDetailRequestId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRequests, setExpandedRequests] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [editingLine, setEditingLine] = useState<{ requestId: string; lineId: string } | null>(null);
  const [lineStatus, setLineStatus] = useState<QuotationRequestLineStatus>('Sent');
  const [lineQuotes, setLineQuotes] = useState<Record<string, { premium: string; currency: 'MVR' | 'USD'; ratePct: string; validUntil: string }>>({});
  const [lineQuoteReference, setLineQuoteReference] = useState('');
  const [lineRemarks, setLineRemarks] = useState('');
  const [lineDeclineReason, setLineDeclineReason] = useState('');
  const [lineError, setLineError] = useState('');
  const [addVendorRequestId, setAddVendorRequestId] = useState('');
  const [addVendorSectionId, setAddVendorSectionId] = useState('');
  const [addVendorId, setAddVendorId] = useState('');
  const requestFormRef = useRef<HTMLFormElement>(null);

  const openNew = useCallback((dealId = '') => {
    setSelectedDealId(dealId);
    setWizardStep(0);
    draftSectionsRef.current = [];
    setDraftSections([]);
    setSectionInsurers({});
    setSectionInterestInputs({});
    setSectionProductCode('');
    setFormError('');
    const deal = deals.find((item) => item.id === dealId);
    const lead = deal && leads.find((item) => item.id === deal.leadId || item.dealId === deal.id);
    const client = deal && resolveDealClient(deal, clients);
    setRiskDetails({
      issuedAt: new Date().toISOString().slice(0, 10),
      insuredName: client?.name ?? deal?.client ?? '', businessActivity: lead?.title ?? deal?.product ?? '',
      additionalActivity: '', riskLocation: client?.address ?? '', territorialLimits: '',
      occupation: deal?.product ?? '', periodOfInsurance: 'TBA', requiredBy: '',
      currency: deal?.currency ?? 'MVR', notes: '', preparedBy: user.name, checkedBy: '',
    });
    setOpen(true);
  }, [clients, deals, leads, user.name]);

  useEffect(() => {
    const applyHash = () => {
      const params = hashParams();
      const requestId = params.get('request') ?? params.get('requestId') ?? '';
      setDetailRequestId(params.get('request') ? requestId : params.get('view') === 'list' ? '' : requestId);
      setRequestFilter(!params.get('request') && params.get('view') === 'list' ? requestId : '');
      const dealId = params.get('deal') ?? params.get('dealId') ?? '';
      setDealFilter(dealId);
      if (dealId && params.get('action') === 'create' && canEdit) {
        openNew(dealId);
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/qslips`);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [canEdit, openNew]);

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId);
  const selectedClient = selectedDeal ? resolveDealClient(selectedDeal, clients) : undefined;
  const linkedLead = selectedDeal
    ? leads.find((lead) => lead.id === selectedDeal.leadId || lead.dealId === selectedDeal.id)
    : undefined;
  const prefillRiskDetails = (dealId: string) => {
    const deal = deals.find((item) => item.id === dealId);
    const lead = deal && leads.find((item) => item.id === deal.leadId || item.dealId === deal.id);
    const client = deal && resolveDealClient(deal, clients);
    setRiskDetails((current) => ({
      ...current,
      insuredName: client?.name ?? deal?.client ?? '',
      businessActivity: lead?.title ?? deal?.product ?? '',
      riskLocation: client?.address ?? '',
      occupation: deal?.product ?? '',
      currency: deal?.currency ?? 'MVR',
    }));
  };
  const updateDraftSections = (update: (current: QuotationSection[]) => QuotationSection[]) => {
    const updated = update(draftSectionsRef.current);
    draftSectionsRef.current = updated;
    setDraftSections(updated);
  };
  const updateSection = (sectionId: string, update: (section: QuotationSection) => QuotationSection) => {
    updateDraftSections((current) => current.map((section) => section.id === sectionId
      ? (() => {
        const updated = update(section);
        return { ...updated, data: withSectionTotal(updated.data) };
      })()
      : section));
  };
  const vendorName = useCallback((vendorId: string) =>
    vendors.find((vendor) => vendor.id === vendorId)?.name ?? 'Unknown insurer', [vendors]);
  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return quotationRequests.flatMap((request) => {
      const { deal, lead, client, clientName } = resolveRequestContext(request, deals, clients, leads);
      if ((requestFilter && request.id !== requestFilter)
        || (dealFilter && request.dealId !== dealFilter)
        || (clientFilter && request.clientId !== clientFilter && client?.id !== clientFilter)) return [];
      const requestMatchesSearch = [
        request.reference, request.dealId, deal?.client, deal?.product, request.leadId,
        lead?.title, lead?.client, clientName,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
      const lines = request.lines.filter((line) => {
        const lineMatchesSearch = [
          request.reference, line.reference, line.insurerQuoteRef,
        ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
        return (!statusFilter || getQuotationLineDisplayStatus(line) === statusFilter)
          && (!vendorFilter || line.vendorId === vendorFilter)
          && (!productFilter || request.sections.find((section) => section.id === line.sectionId)?.productCode === productFilter)
          && (!normalizedQuery || requestMatchesSearch || lineMatchesSearch || vendorName(line.vendorId).toLowerCase().includes(normalizedQuery));
      });
      const hasLineFilters = Boolean(statusFilter || vendorFilter || productFilter);
      if (normalizedQuery && !requestMatchesSearch && !lines.length) return [];
      if (hasLineFilters && !lines.length) return [];
      return [{ request, lines }];
    }).sort((left, right) => right.request.createdAt.localeCompare(left.request.createdAt));
  }, [clientFilter, clients, dealFilter, deals, leads, productFilter, quotationRequests, requestFilter, searchQuery, statusFilter, vendorFilter, vendorName]);

  const addActivity = (request: QuotationRequest, line: QuotationRequestLine, title: string, description: string) => {
    const now = new Date().toISOString();
    setActivities((current) => [{
      id: `qrs-line-${crypto.randomUUID()}`,
      clientId: '',
      leadId: request.leadId,
      dealId: request.dealId,
      insurer: vendorName(line.vendorId),
      type: 'note',
      title: formatQuotationLineActivity(formatQuotationLineReference(line), title),
      description: formatQuotationLineActivity(formatQuotationLineReference(line), `${vendorName(line.vendorId)}: ${description}`),
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    }, ...current]);
  };

  const addSection = () => {
    const product = products.find((item) => item.code === sectionProductCode);
    if (!product) {
      setFormError('Choose a product to add a quotation section.');
      return;
    }
    const section = createQuotationSection(`qrs-section-${crypto.randomUUID()}`, draftSectionsRef.current.length + 1, product);
    updateDraftSections((current) => [...current, section]);
    setSectionInsurers((current) => ({ ...current, [section.id]: [] }));
    setFormError('');
  };

  const initializeDefaultSection = () => {
    if (!selectedDeal || draftSectionsRef.current.length) return;
    const dealProductCode = selectedDeal.productCode?.trim().toUpperCase();
    const product = products.find((item) => item.code.toUpperCase() === dealProductCode)
      ?? products.find((item) => item.name.trim().toLowerCase() === selectedDeal.product.trim().toLowerCase());
    const defaultProduct = product ?? {
      code: selectedDeal.productCode?.trim() || 'GENERAL',
      name: selectedDeal.product.trim() || selectedDeal.productCode?.trim() || 'General insurance',
    };
    const section = createQuotationSection(
      `qrs-section-${crypto.randomUUID()}`,
      1,
      defaultProduct,
      'general',
    );
    updateDraftSections((current) => current.length ? current : [section]);
    setSectionInsurers((current) => ({ ...current, [section.id]: [] }));
    setSectionProductCode(product?.code ?? '');
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!canEdit) {
      setFormError('You are not allowed to create quotation requests.');
      return;
    }
    if (!selectedDeal || isTerminalDealStage(
      selectedDeal.stage,
      selectedDeal.disposition,
      pipelineStages.find((stage) => stage.pipelineId === selectedDeal.pipelineId && stage.name === selectedDeal.stage),
    )) {
      setFormError('Choose an open deal before submitting a quotation request.');
      return;
    }
    if (!linkedLead || !selectedClient || (linkedLead.clientId && linkedLead.clientId !== selectedClient.id)) {
      setFormError('The selected deal must be linked to an active lead and client.');
      return;
    }
    if (!riskDetails.requiredBy || !Number.isFinite(Date.parse(`${riskDetails.requiredBy}T00:00:00`))) {
      setWizardStep(0);
      setFormError('Choose the date by which the quotation is required.');
      return;
    }
    if (!riskDetails.insuredName.trim()) {
      setWizardStep(0);
      setFormError('Enter the insured name for the quotation slip.');
      return;
    }
    if (!riskDetails.issuedAt || !Number.isFinite(Date.parse(`${riskDetails.issuedAt}T00:00:00`))) {
      setWizardStep(0);
      setFormError('Choose a valid issue date for the quotation slip.');
      return;
    }
    if (!draftSections.length) {
      setWizardStep(1);
      setFormError('Add at least one insurance section.');
      return;
    }
    const sectionErrors = draftSections.flatMap((section) => validateQuotationSection(section));
    if (sectionErrors.length) {
      setWizardStep(1);
      setFormError(sectionErrors[0]);
      return;
    }
    const sectionWithoutInsurer = draftSections.find((section) => !sectionInsurers[section.id]?.length);
    if (sectionWithoutInsurer) {
      setWizardStep(2);
      setFormError(`Select at least one insurer for ${sectionWithoutInsurer.title}.`);
      return;
    }

    const now = new Date().toISOString();
    const issuedAt = riskDetails.issuedAt || now.slice(0, 10);
    let reference: string;
    try {
      reference = await getNextReference(
        'quotation-request',
        Number(issuedAt.slice(0, 4)),
        quotationRequests.map((request) => request.reference),
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not allocate a quotation request reference.');
      return;
    }
    const id = `quotation-request-${crypto.randomUUID()}`;
    const sections = draftSections.map((section) => ({ ...section, status: 'Active' as const }));
    const lines = sections.flatMap((section) => (sectionInsurers[section.id] ?? []).map((vendorId, index) => ({
      id: `${id}-line-${section.no}-${index + 1}`,
      reference: createLineReference(reference, section.no, index + 1),
      sectionId: section.id,
      vendorId,
      status: 'Sent' as const,
      sentAt: now,
      quotes: [] as QuotationRequestQuote[],
      remarks: '',
      statusHistory: [{ toStatus: 'Sent' as const, changedAt: now, changedBy: user.id }],
    })));
    const request: QuotationRequest = {
      id,
      reference,
      issuedAt,
      dealId: selectedDeal.id,
      leadId: linkedLead.id,
      clientId: selectedClient.id,
      insuredName: riskDetails.insuredName.trim(),
      businessActivity: riskDetails.businessActivity.trim(),
      additionalActivity: riskDetails.additionalActivity.trim(),
      riskLocation: riskDetails.riskLocation.trim(),
      territorialLimits: riskDetails.territorialLimits.trim(),
      occupation: riskDetails.occupation.trim(),
      periodOfInsurance: riskDetails.periodOfInsurance.trim() || 'TBA',
      requiredBy: riskDetails.requiredBy,
      currency: riskDetails.currency,
      notes: riskDetails.notes.trim(),
      preparedBy: riskDetails.preparedBy.trim(),
      checkedBy: riskDetails.checkedBy.trim(),
      createdAt: now,
      updatedAt: now,
      sections,
      lines,
    };
    if (hasDuplicateQuotationReferences([...quotationRequests, request])) {
      setFormError('This quotation slip would duplicate an existing batch or line reference.');
      return;
    }
    setQuotationRequests((current) => [request, ...current]);
    request.lines.forEach((line) => addActivity(request, line, 'Quotation request line created', 'Request sent to insurer.'));
    setExpandedRequests((current) => [request.id, ...current]);
    setOpen(false);
  };

  const openLineEditor = (request: QuotationRequest, line: QuotationRequestLine) => {
    setEditingLine({ requestId: request.id, lineId: line.id });
    setLineStatus(line.status);
    setLineQuotes(Object.fromEntries((request.sections.find((section) => section.id === line.sectionId)?.data.options ?? [{ id: 'base', label: 'Premium' }])
      .map((option) => {
        const quote = line.quotes.find((item) => item.optionId === option.id);
        const legacy = option.id === 'base' || option.id === 'option-01';
        return [option.id, {
          premium: quote?.premium === undefined && legacy && line.quotedPremium !== undefined ? String(line.quotedPremium) : quote?.premium === undefined ? '' : String(quote.premium),
          currency: quote?.currency ?? line.quotedCurrency ?? request.currency,
          ratePct: quote?.ratePct === undefined && legacy && line.quotedRatePct !== undefined ? String(line.quotedRatePct) : quote?.ratePct === undefined ? '' : String(quote.ratePct),
          validUntil: quote?.validUntil ?? line.validUntil ?? '',
        }];
      })));
    setLineQuoteReference(line.insurerQuoteRef ?? '');
    setLineRemarks(line.remarks);
    setLineDeclineReason(line.declineReason ?? '');
    setLineError('');
  };

  const saveLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingLine) return;
    const request = quotationRequests.find((item) => item.id === editingLine.requestId);
    const line = request?.lines.find((item) => item.id === editingLine.lineId);
    if (!request || !line) {
      setLineError('This quotation request line is no longer available.');
      return;
    }
    const deal = deals.find((item) => item.id === request.dealId);
    const isDealOwner = deal?.ownerId === user.id;
    if (!canEdit && !isDealOwner) {
      setLineError('You are not authorized to update this quotation request line.');
      return;
    }
    const canManageAllStatuses = user.role === 'admin' || activeRole === 'admin' || isDealOwner;
    if (line.status !== lineStatus
      && !canTransitionQuotationRequestStatus(line.status, lineStatus, activeRole, canManageAllStatuses)) {
      setLineError('You are not allowed to make this line status transition.');
      return;
    }
    const section = request.sections.find((item) => item.id === line.sectionId);
    const options = section?.data.options ?? [];
    const requiredQuoteOptionIds = options.length ? options.map((option) => option.id) : ['base'];
    const quoteEntries = Object.entries(lineQuotes);
    if (lineStatus === 'Quoted' && requiredQuoteOptionIds.some((optionId) => {
      const premium = Number(lineQuotes[optionId]?.premium);
      return !Number.isFinite(premium) || premium <= 0;
    })) {
      setLineError('Enter a positive quoted premium for every section option before marking this line Quoted.');
      return;
    }
    if (lineStatus === 'Declined' && !lineDeclineReason.trim()) {
      setLineError('Enter the insurer decline reason before marking this line Declined.');
      return;
    }
    if (quoteEntries.some(([, quote]) => quote.ratePct !== '' && (!Number.isFinite(Number(quote.ratePct)) || Number(quote.ratePct) < 0))) {
      setLineError('Enter a valid quoted rate percentage.');
      return;
    }
    const now = new Date().toISOString();
    const quotes: QuotationRequestQuote[] = quoteEntries
      .filter(([, quote]) => quote.premium !== '')
      .map(([optionId, quote]) => ({
        optionId,
        premium: Number(quote.premium),
        currency: quote.currency,
        ...(quote.ratePct === '' ? {} : { ratePct: Number(quote.ratePct) }),
        ...(quote.validUntil ? { validUntil: quote.validUntil } : {}),
      }));
    const primaryQuote = quotes[0];
    const statusChanged = line.status !== lineStatus;
    const updatedLine: QuotationRequestLine = {
      ...line,
      status: lineStatus,
      ...(lineStatus === 'Sent' ? { sentAt: line.sentAt ?? now } : {}),
      ...(lineStatus === 'Quoted' || lineStatus === 'Declined' ? { respondedAt: now } : {}),
      quotes,
      ...(primaryQuote ? { quotedPremium: primaryQuote.premium, quotedCurrency: primaryQuote.currency } : {}),
      ...(primaryQuote?.ratePct === undefined ? {} : { quotedRatePct: primaryQuote.ratePct }),
      ...(primaryQuote?.validUntil ? { validUntil: primaryQuote.validUntil } : {}),
      ...(lineQuoteReference.trim() ? { insurerQuoteRef: lineQuoteReference.trim() } : {}),
      ...(lineStatus === 'Declined' ? { declineReason: lineDeclineReason.trim() } : {}),
      remarks: lineRemarks.trim(),
      statusHistory: statusChanged ? [...line.statusHistory, {
        fromStatus: line.status,
        toStatus: lineStatus,
        changedAt: now,
        changedBy: user.id,
        ...(lineStatus === 'Declined' ? { reason: lineDeclineReason.trim() } : {}),
      }] : line.statusHistory,
    };
    const updatedRequest: QuotationRequest = {
      ...request,
      updatedAt: now,
      sections: request.sections.map((item) => ({
        ...item,
        status: deriveSectionStatus(item.id, request.lines.map((current) => current.id === line.id ? updatedLine : current)),
      })),
      lines: request.lines.map((item) => item.id === line.id ? updatedLine : item),
    };
    if (hasDuplicateQuotationReferences(quotationRequests.map((item) =>
      item.id === request.id ? updatedRequest : item))) {
      setLineError('This update would duplicate an existing quotation reference.');
      return;
    }
    setQuotationRequests((current) => current.map((item) => item.id === request.id ? updatedRequest : item));
    if (statusChanged) {
      addActivity(request, updatedLine, 'Quotation request line status changed', `${line.status} → ${lineStatus}${lineStatus === 'Declined' ? ` · ${lineDeclineReason.trim()}` : ''}`);
    } else if (lineStatus === 'Quoted') {
      addActivity(request, updatedLine, 'Carrier quotation logged', `${quotes.length} option quote${quotes.length === 1 ? '' : 's'} logged.`);
    }
    setEditingLine(null);
  };

  const addInsurerLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = quotationRequests.find((item) => item.id === addVendorRequestId);
    if (!request || !addVendorId) return;
    const section = request.sections.find((item) => item.id === addVendorSectionId);
    if (!section) return;
    if (hasActiveQuotationLine(request.lines, section.id, addVendorId)) {
      setLineError('This insurer already has an active line in this section.');
      return;
    }
    const now = new Date().toISOString();
    const line: QuotationRequestLine = {
      id: `${request.id}-line-${crypto.randomUUID()}`,
      reference: nextLineReference(request, section.id),
      sectionId: section.id,
      vendorId: addVendorId,
      status: 'Requested',
      quotes: [],
      remarks: '',
      statusHistory: [{ toStatus: 'Requested', changedAt: now, changedBy: user.id }],
    };
    const updatedLines = [...request.lines, line];
    const updatedRequest = {
      ...request,
      updatedAt: now,
      sections: request.sections.map((item) => ({ ...item, status: deriveSectionStatus(item.id, updatedLines) })),
      lines: updatedLines,
    };
    if (hasDuplicateQuotationReferences(quotationRequests.map((item) =>
      item.id === request.id ? updatedRequest : item))) {
      setLineError('This insurer line would duplicate an existing quotation reference.');
      return;
    }
    setQuotationRequests((current) => current.map((item) => item.id === request.id ? updatedRequest : item));
    addActivity(updatedRequest, line, 'Quotation request line created', 'Insurer added to the batch.');
    setAddVendorRequestId('');
    setAddVendorId('');
    setAddVendorSectionId('');
  };

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId]);
    setExpandedSections((current) => current.filter((key) => !key.startsWith(`${requestId}:`)));
  };
  const toggleSection = (requestId: string, sectionId: string) => {
    const sectionKey = `${requestId}:${sectionId}`;
    setExpandedSections((current) => {
      const requestSections = current.filter((key) => !key.startsWith(`${requestId}:`));
      return current.includes(sectionKey) ? requestSections : [...requestSections, sectionKey];
    });
  };

  const visibleRequest = editingLine
    ? quotationRequests.find((request) => request.id === editingLine.requestId)
    : undefined;
  const visibleLine = visibleRequest?.lines.find((line) => line.id === editingLine?.lineId);
  const visibleSection = visibleRequest?.sections.find((section) => section.id === visibleLine?.sectionId);
  const visibleQuoteOptions = visibleSection?.data.options.length
    ? visibleSection.data.options
    : [{ id: 'base', label: 'Premium', coverages: [] }];
  const canManageVisibleLineStatuses = user.role === 'admin'
    || activeRole === 'admin'
    || deals.find((deal) => deal.id === visibleRequest?.dealId)?.ownerId === user.id;
  const addVendorRequest = quotationRequests.find((request) => request.id === addVendorRequestId);
  const availableVendors = addVendorRequest
    ? insurerOptions.filter((vendor) => !hasActiveQuotationLine(addVendorRequest.lines, addVendorSectionId, vendor.id))
    : [];
  const detailRequest = quotationRequests.find((request) => request.id === detailRequestId);
  const detailRouteParams = hashParams();
  const detailSource = detailRouteParams.get('source');
  const detailDealId = detailRouteParams.get('deal') ?? detailRouteParams.get('dealId') ?? '';
  const detailIsLinked = !detailDealId || detailRequest?.dealId === detailDealId;
  if (detailRequestId) {
    if (!dataReady) return <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-6 text-sm text-muted">Loading quotation slip…</div>;
    if (!detailRequest || !detailIsLinked) return <div className="rounded-xl border border-ink-600 bg-ink-900/30 p-6">
      <p className="text-sm text-muted">Request not found.</p>
      <a className="btn-ghost mt-3 inline-flex" href={detailDealId
        ? dashboardHref('deals', { deal: detailDealId, view: detailRouteParams.get('dealView') ?? 'list' })
        : dashboardHref('qslips')}>{detailDealId ? 'Back to deal' : 'Back to QRS list'}</a>
    </div>;
    return <QuotationRequestDetailWorkspace
      request={detailRequest}
      backLabel={detailSource === 'list' ? 'QRS list' : detailDealId ? 'Back to deal' : 'QRS list'}
      backHref={detailSource === 'list'
        ? dashboardHref('qslips', detailDealId ? { deal: detailDealId } : {})
        : detailDealId
          ? dashboardHref('deals', { deal: detailDealId, view: detailRouteParams.get('dealView') ?? 'list' })
          : dashboardHref('qslips')}
      onBack={() => {
        window.location.hash = detailSource === 'list'
          ? dashboardHref('qslips', detailDealId ? { deal: detailDealId } : {})
          : detailDealId
            ? dashboardHref('deals', { deal: detailDealId, view: detailRouteParams.get('dealView') ?? 'list' })
            : dashboardHref('qslips');
      }}
    />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <PageToolbar name="qslips">
        <div className="flex items-center gap-1" role="group" aria-label="Filter by quotation request status">
          {([
            { status: 'Requested', variant: 'warm' as const },
            { status: 'Sent', variant: 'cold' as const },
            { status: 'Quoted', variant: 'win' as const },
          ]).map(({ status, variant }) => (
            <button key={status} type="button" aria-pressed={statusFilter === status}
              className={`rounded-full transition ${statusFilter === status ? 'ring-2 ring-brand-400' : 'hover:opacity-80'}`}
              onClick={() => setStatusFilter((current) => current === status ? '' : status)}>
              <Badge compact variant={variant}>{status} <span className="font-semibold">{quotationRequests.flatMap((request) => request.lines).filter((line) => getQuotationLineDisplayStatus(line) === status).length}</span></Badge>
            </button>
          ))}
        </div>
        <div className="relative min-w-32 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
          <input className="input w-full !py-1.5 !pl-9 !text-xs" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search batch, line, or insurer ref" aria-label="Search quotation requests" />
        </div>
        <select className="input !w-auto max-w-28 !py-1.5 !text-[10px]" aria-label="Filter quotation requests by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select className="input !w-auto max-w-28 !py-1.5 !text-[10px]" aria-label="Filter quotation requests by vendor" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
          <option value="">All vendors</option>
          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
        <select className="input !w-auto max-w-28 !py-1.5 !text-[10px]" aria-label="Filter quotation requests by client" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
          <option value="">All clients</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
        <select className="input !w-auto max-w-32 !py-1.5 !text-[10px]" aria-label="Filter quotation requests by product" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
          <option value="">All products</option>
          {products.map((product) => <option key={product.code} value={product.code}>{product.name}</option>)}
        </select>
        {requestFilter && <button type="button" className="btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => {
          setRequestFilter('');
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/qslips`);
        }}>Clear linked-request filter</button>}
        {dealFilter && <button type="button" className="btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => {
          setDealFilter('');
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/qslips`);
        }}>Clear deal filter</button>}
        {canEdit && <button className="btn-primary !px-2 !py-1.5 !text-xs" onClick={() => openNew()}><Plus size={14} /> New QRS</button>}
      </PageToolbar>

      <div data-page-content="qslips" className="glass min-w-0 overflow-hidden rounded-2xl">
        <div className="fit-wrap qrs-list-fit w-full max-w-full min-w-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-900/60 text-[11px] tracking-wider text-muted">
              <tr>
                {['Batch / Deal', 'Lead', 'Client', 'Batch status', 'Required by', 'Insured amount', 'Actions'].map((label) => (
                  <th key={label} scope="col" className={`px-3 py-3 font-medium ${label === 'Actions' ? 'text-right' : 'text-left'}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(({ request, lines }) => {
                const { deal, clientName, leadDetail, leadIdentifier } = resolveRequestContext(request, deals, clients, leads);
                const canEditRequest = canEdit || deal?.ownerId === user.id;
                const status = deriveRequestStatus(request.lines);
                const expanded = expandedRequests.includes(request.id);
                const total = request.sections.reduce((sum, section) => sum + quotationSectionTotal(section.data), 0);
                return (
                  <Fragment key={request.id}>
                    <tr className="table-row cursor-pointer focus-within:bg-ink-750/30" role="link" tabIndex={0} aria-label={`Open QRS details ${request.reference}`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('a,button,input,select')) return;
                        window.location.hash = dashboardHref('qslips', {
                          request: request.id,
                          deal: request.dealId,
                          source: 'list',
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget && (event.target as HTMLElement).closest('a,button,input,select')) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          window.location.hash = dashboardHref('qslips', {
                            request: request.id,
                            deal: request.dealId,
                            source: 'list',
                          });
                        }
                      }}>
                      <td className="px-3 py-3">
                        <button type="button" className="mr-2 align-middle text-muted" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${request.reference}`} onClick={() => toggleExpanded(request.id)}>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <span className="font-medium text-brand-300">{request.reference}</span>
                        <div className="ml-6 font-mono text-[10px] text-muted">{deal?.id ?? request.dealId} · {deal?.product ?? 'Deal unavailable'}</div>
                      </td>
                      <td className="px-3 py-3"><div className="font-mono text-xs">{leadIdentifier}</div><div className="text-muted">{leadDetail}</div></td>
                      <td className="px-3 py-3 text-white">{clientName}</td>
                      <td className="px-3 py-3"><Badge variant={statusTone(status)}>{status}</Badge><div className="text-[10px] text-muted">{lines.length} matching line{lines.length === 1 ? '' : 's'}</div></td>
                      <td className="px-3 py-3 text-muted">{formatDate(request.requiredBy)}</td>
                      <td className="px-3 py-3 font-medium text-white">{formatAmount(total, request.currency)}</td>
                      <td className="px-3 py-3 text-right">
                        <a className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-ink-600 px-2 py-1 text-xs text-brand-300 hover:border-ink-500 hover:text-white" href={dashboardHref('deals', { id: request.dealId })} onClick={(event) => event.stopPropagation()}>Deal <ArrowUpRight size={13} /></a>
                      </td>
                    </tr>
                    {expanded && request.sections.map((section) => {
                      const sectionLines = lines.filter((line) => line.sectionId === section.id);
                      if (statusFilter || vendorFilter || clientFilter || productFilter || searchQuery || requestFilter) {
                        if (!sectionLines.length) return null;
                      }
                      const sectionKey = `${request.id}:${section.id}`;
                      const sectionExpanded = expandedSections.includes(sectionKey);
                      return <Fragment key={section.id}>
                        <tr className="border-t border-ink-700/60 bg-ink-900/20 text-xs">
                          <td className="py-2 pl-8">
                            <button type="button" className="mr-2 align-middle text-muted" aria-label={`${sectionExpanded ? 'Collapse' : 'Expand'} ${section.title}`} onClick={() => toggleSection(request.id, section.id)}>
                              {sectionExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                            <span className="font-medium text-white">{String(section.no).padStart(2, '0')} · {section.title}</span>
                            <div className="ml-7 font-mono text-[10px] text-muted">{section.productCode}</div>
                          </td>
                          <td className="py-2 text-muted">{sectionLines.length} insurer line{sectionLines.length === 1 ? '' : 's'}</td>
                          <td className="py-2 text-muted">—</td>
                          <td className="py-2"><Badge variant={deriveSectionStatus(section.id, request.lines) === 'Active' ? 'brand' : 'muted'} compact>{deriveSectionStatus(section.id, request.lines)}</Badge></td>
                          <td className="py-2 text-muted">{formatDate(request.requiredBy)}</td>
                          <td className="py-2 text-muted">
                            {formatAmount(section.data.totalSumInsured, request.currency)}
                            <div className="text-[10px]">{section.data.options.map((option) => option.label).join(', ') || 'Standard cover'}</div>
                          </td>
                          <td className="py-2 text-right">
                            {canEditRequest && <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setAddVendorRequestId(request.id); setAddVendorSectionId(section.id); setAddVendorId(''); setLineError(''); }}>Add insurer</button>}
                          </td>
                        </tr>
                        {sectionExpanded && sectionLines.map((line) => (
                          <tr key={line.id} className="border-t border-ink-700/60 bg-ink-950/30 text-xs">
                            <td className="py-2 pl-14 font-mono text-brand-300">
                              {formatQuotationLineReference(line)}
                              <div className="font-sans text-[10px] text-white">{vendorName(line.vendorId)}</div>
                              {line.insurerQuoteRef && <div className="font-sans text-[10px] text-muted">Insurer ref: {line.insurerQuoteRef}</div>}
                            </td>
                            <td className="py-2 font-mono text-[10px] text-white">{leadIdentifier}<div className="font-sans text-muted">{leadDetail}</div></td>
                            <td className="py-2 text-white">{clientName}</td>
                            <td className="py-2">
                              <Badge variant={statusTone(getQuotationLineDisplayStatus(line))} compact>{getQuotationLineDisplayStatus(line)}</Badge>
                              {(line.declineReason || line.remarks) && <div className="mt-1 text-[10px] text-muted">{line.declineReason || line.remarks}</div>}
                            </td>
                            <td className="py-2 text-muted">{formatDate(request.requiredBy)}</td>
                            <td className="py-2 font-medium text-white">
                              {formatAmount(section.data.totalSumInsured, request.currency)}
                              {line.quotes.map((quote) => <div key={quote.optionId} className="mt-1 text-[10px] text-muted">
                                {section.data.options.find((option) => option.id === quote.optionId)?.label ?? 'Premium'}: {formatAmount(quote.premium, quote.currency)}
                                {quote.ratePct !== undefined ? ` · ${quote.ratePct}%` : ''}
                              </div>)}
                            </td>
                            <td className="py-2 text-right">
                              {canEditRequest && <button type="button" className="btn-ghost !px-2 !py-1 text-xs" aria-label={`Update ${line.reference}`} onClick={() => openLineEditor(request, line)}>Update</button>}
                            </td>
                          </tr>
                        ))}
                      </Fragment>;
                    })}
                  </Fragment>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                  {quotationRequests.length ? 'No quotation request lines match these filters.' : 'No quotation requests yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Quotation Request Slip" subtitle={`Step ${wizardStep + 1} of 4 · ${['Deal and risk details', 'Insurance sections', 'Insurer selection', 'Review and create'][wizardStep]}`} size="lg" footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
          <div className="flex items-center gap-2">
            {wizardStep > 0 && <button type="button" className="btn-ghost" onClick={() => { setWizardStep((step) => step - 1); setFormError(''); }}><ArrowLeft size={14} /> Back</button>}
            <button type="button" className="btn-primary" onClick={() => {
              setFormError('');
              if (wizardStep === 0 && !selectedDeal) {
                setFormError('Choose an open deal before continuing.');
                return;
              }
              if (wizardStep === 0) initializeDefaultSection();
              if (wizardStep === 1 && !draftSectionsRef.current.length) {
                setFormError('Add at least one insurance section before selecting insurers.');
                return;
              }
              if (wizardStep < 3) setWizardStep((step) => step + 1);
              else requestFormRef.current?.requestSubmit();
            }}>
              {wizardStep < 3 ? <><span>Continue</span><ArrowRight size={14} /></> : <><Send size={14} /> Create slips</>}
            </button>
          </div>
        </div>
      }>
        <form ref={requestFormRef} id="quotation-request-form" onSubmit={submitRequest} className="space-y-4">
          {wizardStep === 0 && <>
            <FilterField label="Open deal *">
              <select className="input" required value={selectedDealId} onChange={(event) => {
                setSelectedDealId(event.target.value);
                prefillRiskDetails(event.target.value);
                setFormError('');
              }}>
                <option value="">Select an open deal</option>
                {openDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.client} · {deal.product}</option>)}
              </select>
            </FilterField>
            {selectedDeal && <section className="grid grid-cols-1 gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-3 sm:grid-cols-3">
              <ReadOnlyField label="Client" value={selectedClient?.name ?? selectedDeal.client} />
              <ReadOnlyField label="Lead" value={linkedLead?.title ?? linkedLead?.client ?? 'No linked lead'} />
              <ReadOnlyField label="Deal" value={`${selectedDeal.id} · ${selectedDeal.product}`} />
            </section>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FilterField label="Issued date *"><DateInput required value={riskDetails.issuedAt} onIsoChange={(value) => setRiskDetails((current) => ({ ...current, issuedAt: value }))} aria-label="Issued date" /></FilterField>
              <FilterField label="Required by *"><DateInput required value={riskDetails.requiredBy} onIsoChange={(requiredByValue) => setRiskDetails((current) => ({ ...current, requiredBy: requiredByValue }))} aria-label="Required by date" /></FilterField>
              <FilterField label="Insured name *"><input className="input" required value={riskDetails.insuredName} onChange={(event) => setRiskDetails((current) => ({ ...current, insuredName: event.target.value }))} /></FilterField>
              <FilterField label="Business activity"><input className="input" value={riskDetails.businessActivity} onChange={(event) => setRiskDetails((current) => ({ ...current, businessActivity: event.target.value }))} /></FilterField>
              <FilterField label="Additional activity"><input className="input" value={riskDetails.additionalActivity} onChange={(event) => setRiskDetails((current) => ({ ...current, additionalActivity: event.target.value }))} /></FilterField>
              <FilterField label="Risk location"><input className="input" value={riskDetails.riskLocation} onChange={(event) => setRiskDetails((current) => ({ ...current, riskLocation: event.target.value }))} /></FilterField>
              <FilterField label="Territorial limits"><input className="input" value={riskDetails.territorialLimits} onChange={(event) => setRiskDetails((current) => ({ ...current, territorialLimits: event.target.value }))} /></FilterField>
              <FilterField label="Occupation"><input className="input" value={riskDetails.occupation} onChange={(event) => setRiskDetails((current) => ({ ...current, occupation: event.target.value }))} /></FilterField>
              <FilterField label="Period of insurance"><input className="input" value={riskDetails.periodOfInsurance} onChange={(event) => setRiskDetails((current) => ({ ...current, periodOfInsurance: event.target.value }))} /></FilterField>
              <FilterField label="Currency"><select className="input" value={riskDetails.currency} onChange={(event) => setRiskDetails((current) => ({ ...current, currency: event.target.value as 'MVR' | 'USD' }))}><option value="MVR">MVR</option><option value="USD">USD</option></select></FilterField>
              <FilterField label="Prepared by"><input className="input" value={riskDetails.preparedBy} onChange={(event) => setRiskDetails((current) => ({ ...current, preparedBy: event.target.value }))} /></FilterField>
              <FilterField label="Checked by"><input className="input" value={riskDetails.checkedBy} onChange={(event) => setRiskDetails((current) => ({ ...current, checkedBy: event.target.value }))} /></FilterField>
            </div>
            <FilterField label="Notes"><textarea className="input min-h-16" maxLength={2000} value={riskDetails.notes} onChange={(event) => setRiskDetails((current) => ({ ...current, notes: event.target.value }))} /></FilterField>
          </>}

          {wizardStep === 1 && <div className="space-y-4">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <FilterField label="Product section *">
                <select className="input" value={sectionProductCode} onChange={(event) => setSectionProductCode(event.target.value)}>
                  <option value="">Select a product</option>
                  {products.map((product) => <option key={product.code} value={product.code}>{product.name} ({product.code})</option>)}
                </select>
              </FilterField>
              <button type="button" className="btn-ghost w-full sm:w-auto" onClick={addSection}><Plus size={14} /> Add section</button>
            </div>
            {draftSections.map((section) => <section key={section.id} className="space-y-3 rounded-xl border border-ink-600 bg-ink-900/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{String(section.no).padStart(2, '0')} · {section.title}</h3>
                <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => {
                  updateDraftSections((current) => current.filter((item) => item.id !== section.id).map((item, index) => ({ ...item, no: index + 1 })));
                  setSectionInsurers((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== section.id)));
                  setSectionInterestInputs((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${section.id}:`))));
                }}>Remove</button>
              </div>
              {section.data.interests.map((interest, index) => {
                const inputKey = `${section.id}:${index}`;
                return <div key={`${section.id}-interest-${index}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem]">
                  <FilterField label={`Interest ${index + 1}`}><input className="input" value={interest.interest} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, interests: item.data.interests.map((entry, entryIndex) => entryIndex === index ? { ...entry, interest: event.target.value } : entry) } }))} /></FilterField>
                  <FilterField label="Sum insured"><input className="input" type="number" min="0" step="0.01" value={sectionInterestInputs[inputKey] ?? String(interest.sumInsured)} onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSectionInterestInputs((current) => ({ ...current, [inputKey]: value }));
                    const sumInsured = value === '' ? 0 : Number(value);
                    if (Number.isFinite(sumInsured)) {
                      updateSection(section.id, (item) => ({ ...item, data: { ...item.data, interests: item.data.interests.map((entry, entryIndex) => entryIndex === index ? { ...entry, sumInsured } : entry) } }));
                    }
                  }} onBlur={() => setSectionInterestInputs((current) => {
                    const remaining = { ...current };
                    delete remaining[inputKey];
                    return remaining;
                  })} /></FilterField>
                </div>;
              })}
              {section.data.businessInterruption && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FilterField label="Gross profit"><input className="input" type="number" min="0" step="0.01" value={section.data.businessInterruption.grossProfit} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, businessInterruption: { ...item.data.businessInterruption!, grossProfit: Number(event.target.value) } } }))} /></FilterField>
                <FilterField label="Indemnity months"><input className="input" type="number" min="1" step="1" value={section.data.businessInterruption.indemnityMonths} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, businessInterruption: { ...item.data.businessInterruption!, indemnityMonths: Number(event.target.value) } } }))} /></FilterField>
              </div>}
              {section.data.options.map((option, optionIndex) => <fieldset key={option.id} className="rounded-lg border border-ink-700 p-3">
                <legend className="px-1 text-xs text-brand-300">{option.label}</legend>
                {option.coverages.map((coverage, coverageIndex) => <div key={`${option.id}-${coverageIndex}`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <FilterField label="Coverage head"><input className="input" value={coverage.name} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, options: item.data.options.map((current, index) => index === optionIndex ? { ...current, coverages: current.coverages.map((entry, entryIndex) => entryIndex === coverageIndex ? { ...entry, name: event.target.value } : entry) } : current) } }))} /></FilterField>
                  <FilterField label="Limit"><input className="input" type="number" min="0" step="0.01" value={coverage.limit} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, options: item.data.options.map((current, index) => index === optionIndex ? { ...current, coverages: current.coverages.map((entry, entryIndex) => entryIndex === coverageIndex ? { ...entry, limit: Number(event.target.value) } : entry) } : current) } }))} /></FilterField>
                </div>)}
              </fieldset>)}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(section.data.materialInfo).map(([field, value]) => <FilterField key={field} label={field}><input className="input" value={value} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, materialInfo: { ...item.data.materialInfo, [field]: event.target.value } } }))} /></FilterField>)}
                <FilterField label="Target rate %"><input className="input" type="number" min="0" step="0.01" value={section.data.targetRatePct ?? ''} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, targetRatePct: event.target.value === '' ? undefined : Number(event.target.value) } }))} /></FilterField>
                <FilterField label="Deductibles (one per line)"><textarea className="input min-h-16" value={section.data.deductibles.join('\n')} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, deductibles: event.target.value.split(/\r?\n/) } }))} /></FilterField>
                <FilterField label="Extensions (name | limit, one per line)"><textarea className="input min-h-16" value={section.data.extensions.map((extension) => `${extension.name} | ${extension.limit}`).join('\n')} onChange={(event) => updateSection(section.id, (item) => ({ ...item, data: { ...item.data, extensions: event.target.value.split(/\r?\n/).filter(Boolean).map((entry) => { const [name, ...limit] = entry.split('|'); return { name: name.trim(), limit: limit.join('|').trim() }; }) } }))} /></FilterField>
              </div>
              <div className="text-xs text-muted">Derived total insured: <span className="font-semibold text-white">{formatAmount(section.data.totalSumInsured, riskDetails.currency)}</span></div>
            </section>)}
            {!draftSections.length && <p className="rounded-lg border border-dashed border-ink-600 p-4 text-sm text-muted">Add one or more products to define the requested insurance sections.</p>}
          </div>}

          {wizardStep === 2 && <div className="space-y-4">
            <p className="text-sm text-muted">Select the insurers that should receive each section. An insurer may receive any subset of the slip.</p>
            {draftSections.map((section) => <fieldset key={section.id} className="min-w-0 rounded-xl border border-ink-600 p-3">
              <legend className="max-w-full px-1 text-sm font-medium text-white">{String(section.no).padStart(2, '0')} · {section.title}</legend>
              {insurerOptions.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {insurerOptions.map((vendor) => <label key={vendor.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 text-sm text-white">
                  <input className="shrink-0 accent-brand-400" type="checkbox" checked={(sectionInsurers[section.id] ?? []).includes(vendor.id)} onChange={() => setSectionInsurers((current) => ({
                    ...current,
                    [section.id]: (current[section.id] ?? []).includes(vendor.id)
                      ? current[section.id].filter((id) => id !== vendor.id)
                      : [...(current[section.id] ?? []), vendor.id],
                  }))} />
                  <span className="min-w-0 truncate">{vendor.name}</span><span className="ml-auto shrink-0 text-[10px] text-muted">{vendor.vendorType}</span>
                </label>)}
              </div> : <p className="text-sm text-muted">Add an active insurer or reinsurer before creating the slip.</p>}
            </fieldset>)}
            {!draftSections.length && <p className="rounded-lg border border-dashed border-ink-600 p-4 text-sm text-muted">No insurance sections to map. Go back and add at least one section first.</p>}
          </div>}

          {wizardStep === 3 && <div className="space-y-3">
            <section className="grid grid-cols-1 gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-3 sm:grid-cols-2">
              <ReadOnlyField label="Deal" value={selectedDeal ? `${selectedDeal.client} · ${selectedDeal.product}` : 'Select a deal'} />
              <ReadOnlyField label="Insured" value={riskDetails.insuredName || 'Not specified'} />
              <ReadOnlyField label="Issued / required by" value={`${formatDate(riskDetails.issuedAt)} / ${formatDate(riskDetails.requiredBy)}`} />
              <ReadOnlyField label="Prepared / checked by" value={`${riskDetails.preparedBy || '—'} / ${riskDetails.checkedBy || '—'}`} />
            </section>
            {draftSections.map((section) => <section key={section.id} className="rounded-xl border border-ink-600 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{section.title} · {formatAmount(section.data.totalSumInsured, riskDetails.currency)}</h3>
                <span className="text-xs text-muted">{(sectionInsurers[section.id] ?? []).map(vendorName).join(', ') || 'No insurer selected'}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{section.data.options.map((option) => option.label).join(', ') || section.data.interests.map((interest) => interest.interest).join(', ')}</p>
            </section>)}
          </div>}
          {formError && <p role="alert" className="text-sm text-hot">{formError}</p>}
        </form>
      </Modal>

      <Modal open={Boolean(editingLine)} onClose={() => setEditingLine(null)} title={`Update QRS line${visibleLine ? ` · ${visibleLine.reference}` : ''}`} size="md" footer={<>
        <button type="button" className="btn-ghost" onClick={() => setEditingLine(null)}><X size={14} /> Cancel</button>
        <button type="submit" form="qrs-line-form" className="btn-primary">Save line</button>
      </>}>
        {visibleLine && <form id="qrs-line-form" onSubmit={saveLine} className="space-y-3">
          <FilterField label="Status *">
            <select className="input" value={lineStatus} onChange={(event) => setLineStatus(event.target.value as QuotationRequestLineStatus)}>
              {quotationRequestStatusOptions(visibleLine.status, activeRole, canManageVisibleLineStatuses)
                .map(({ status, label, disabled }) => <option key={status} value={status} disabled={disabled}>{label}</option>)}
            </select>
          </FilterField>
          {lineStatus === 'Quoted' && <>
            {visibleQuoteOptions.map((option) => <fieldset key={option.id} className="grid grid-cols-1 gap-2 rounded-lg border border-ink-700 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs text-brand-300">{option.label}</legend>
              <FilterField label={`Premium *`}><input className="input" type="number" min="0.01" step="0.01" required value={lineQuotes[option.id]?.premium ?? ''} onChange={(event) => setLineQuotes((current) => ({ ...current, [option.id]: { premium: event.target.value, currency: current[option.id]?.currency ?? visibleRequest?.currency ?? 'MVR', ratePct: current[option.id]?.ratePct ?? '', validUntil: current[option.id]?.validUntil ?? '' } }))} /></FilterField>
              <FilterField label="Currency"><select className="input" value={lineQuotes[option.id]?.currency ?? visibleRequest?.currency ?? 'MVR'} onChange={(event) => setLineQuotes((current) => ({ ...current, [option.id]: { premium: current[option.id]?.premium ?? '', currency: event.target.value as 'MVR' | 'USD', ratePct: current[option.id]?.ratePct ?? '', validUntil: current[option.id]?.validUntil ?? '' } }))}><option value="MVR">MVR</option><option value="USD">USD</option></select></FilterField>
              <FilterField label="Rate %"><input className="input" type="number" min="0" step="0.01" value={lineQuotes[option.id]?.ratePct ?? ''} onChange={(event) => setLineQuotes((current) => ({ ...current, [option.id]: { premium: current[option.id]?.premium ?? '', currency: current[option.id]?.currency ?? visibleRequest?.currency ?? 'MVR', ratePct: event.target.value, validUntil: current[option.id]?.validUntil ?? '' } }))} /></FilterField>
              <FilterField label="Valid until"><DateInput value={lineQuotes[option.id]?.validUntil ?? ''} onIsoChange={(validUntil) => setLineQuotes((current) => ({ ...current, [option.id]: { premium: current[option.id]?.premium ?? '', currency: current[option.id]?.currency ?? visibleRequest?.currency ?? 'MVR', ratePct: current[option.id]?.ratePct ?? '', validUntil } }))} aria-label={`${option.label} valid until`} /></FilterField>
            </fieldset>)}
            <FilterField label="Insurer quote reference"><input className="input" value={lineQuoteReference} onChange={(event) => setLineQuoteReference(event.target.value)} /></FilterField>
          </>}
          {lineStatus === 'Declined' && <FilterField label="Decline reason *"><textarea className="input min-h-16" required value={lineDeclineReason} onChange={(event) => setLineDeclineReason(event.target.value)} /></FilterField>}
          <FilterField label="Remarks"><textarea className="input min-h-16" value={lineRemarks} onChange={(event) => setLineRemarks(event.target.value)} /></FilterField>
          {lineError && <p role="alert" className="text-sm text-hot">{lineError}</p>}
        </form>}
      </Modal>

      <Modal open={Boolean(addVendorRequestId)} onClose={() => setAddVendorRequestId('')} title="Add insurer to batch" size="sm" footer={<>
        <button type="button" className="btn-ghost" onClick={() => setAddVendorRequestId('')}><X size={14} /> Cancel</button>
        <button type="submit" form="qrs-add-line-form" className="btn-primary">Add line</button>
      </>}>
        <form id="qrs-add-line-form" onSubmit={addInsurerLine} className="space-y-3">
          <FilterField label="Insurer / Reinsurer *"><select className="input" required value={addVendorId} onChange={(event) => setAddVendorId(event.target.value)}>
            <option value="">Select insurer</option>
            {availableVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select></FilterField>
          {lineError && <p role="alert" className="text-sm text-hot">{lineError}</p>}
        </form>
      </Modal>

    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 text-sm text-white">{value}</div></div>;
}
