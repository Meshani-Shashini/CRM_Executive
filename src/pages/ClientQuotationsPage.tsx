import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, FilePlus2, Printer, RefreshCw, Save, Send } from 'lucide-react';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import { useApp } from '../store/AppContext';
import type {
  ClientQuotation, ClientQuotationSection, ClientQuotationStatus,
  ClientQuotationSource, QuotationRequest, QuotationSection,
} from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import {
  buildClientQuotationSources, canTransitionClientQuotation, createClientQuotationDraft,
  defaultLowestPremiumSelections, defaultQuotationValidUntil, getSourceValidityWarnings,
  isQuotationExpired, quoteForSource, quotationRatePct, quotationTotalPremium,
  quotationTotalSumInsured, sourceValidityConfirmationRequired, validateClientQuotation,
  type ClientQuotationClauseSet,
} from '../utils/clientQuotations';
import { dashboardHref, hashParams } from '../utils/navigation';
import { printDocument } from '../utils/print';
import { getNextReference } from '../utils/references';
import { TENANT_ID } from '../lib/supabase';

type ClauseSelection = Record<string, boolean>;

const clauseKey = (sectionId: string, group: string, index: number) => `${sectionId}:${group}:${index}`;

function visibleStatus(quotation: ClientQuotation): ClientQuotationStatus {
  return quotation.status === 'Issued' && isQuotationExpired(quotation) ? 'Expired' : quotation.status;
}

function getClauseSet(quotationClauses: typeof import('../data/catalogs').COMPANY.quotationClauses, productCode: string): ClientQuotationClauseSet {
  const clauses = quotationClauses[productCode] ?? quotationClauses.default;
  return {
    perils: clauses.perils ?? [],
    deductibles: clauses.deductibles ?? [],
    warranties: clauses.warranties ?? [],
    exclusions: clauses.exclusions ?? [],
    conditions: clauses.conditions ?? [],
    disclaimer: clauses.disclaimer ?? '',
    communicableDiseaseExclusion: clauses.communicableDiseaseExclusion ?? '',
    sanctionClause: clauses.sanctionClause ?? '',
  };
}

function lineIsEligibleForSection(request: QuotationRequest, section: QuotationSection, now = new Date()) {
  const optionKeys = section.data.options.map((option) => option.id);
  const keys = optionKeys.length ? optionKeys : [undefined];
  return keys.every((optionKey) => request.lines.some((line) => {
    if (line.sectionId !== section.id || line.status !== 'Quoted') return false;
    const quote = quoteForSource(line, optionKey);
    if (!quote || quote.premium <= 0) return false;
    if (!quote.validUntil) return true;
    return Date.parse(`${quote.validUntil.slice(0, 10)}T23:59:59.999Z`) >= now.getTime();
  }));
}

function quoteFromSource(request: QuotationRequest, source: ClientQuotationSource) {
  const line = request.lines.find((entry) => entry.id === source.lineId);
  return line ? { line, quote: quoteForSource(line, source.optionKey) } : undefined;
}

function defaultClauseSelection(sections: QuotationSection[], quotationClauses: typeof import('../data/catalogs').COMPANY.quotationClauses) {
  const selected: ClauseSelection = {};
  for (const section of sections) {
    const clauses = getClauseSet(quotationClauses, section.productCode);
    for (const [group, values] of [
      ['peril', clauses.perils],
      ['deductible', clauses.deductibles],
      ['warranty', clauses.warranties],
      ['condition', clauses.conditions ?? []],
      ['exclusion', clauses.exclusions],
      ['communicableDiseaseExclusion', clauses.communicableDiseaseExclusion ? [clauses.communicableDiseaseExclusion] : []],
      ['sanctionClause', clauses.sanctionClause ? [clauses.sanctionClause] : []],
    ] as const) {
      values.forEach((_, index) => { selected[clauseKey(section.id, group, index)] = true; });
    }
  }
  return selected;
}

export default function ClientQuotationsPage() {
  const {
    clientQuotations, setClientQuotations, quotationRequests, deals, leads, clients, vendors,
    company, user, users, viewAsRole, pipelineStages, setStageHistory, setDeals, setActivities,
  } = useApp();
  const role = viewAsRole ?? user.role;
  const canManage = role === 'admin' || role === 'sales';
  const query = hashParams();
  const queryDealId = query.get('dealId') ?? '';
  const queryRequestId = query.get('requestId') ?? '';
  const queryQuotationId = query.get('quotationId') ?? '';
  const queryLineId = query.get('lineId') ?? '';
  const autoOpened = useRef(false);
  const [editor, setEditor] = useState<ClientQuotation | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState(queryRequestId);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<string, string>>({});
  const [clauseSelection, setClauseSelection] = useState<ClauseSelection>({});
  const [wizardContactId, setWizardContactId] = useState('');
  const [wizardDesignation, setWizardDesignation] = useState('');
  const [wizardAuthorizerId, setWizardAuthorizerId] = useState('');
  const [validityConfirmed, setValidityConfirmed] = useState(false);
  const [acceptanceName, setAcceptanceName] = useState('');
  const [acceptanceDesignation, setAcceptanceDesignation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const visibleQuotations = [...clientQuotations]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.version - left.version);
  const dealRequests = quotationRequests.filter((request) => request.dealId === queryDealId);
  const sourceRequest = quotationRequests.find((request) => request.id === selectedRequestId);
  const selectedDeal = deals.find((deal) => deal.id === queryDealId);
  const selectedClient = clients.find((client) => client.id === (sourceRequest?.clientId ?? selectedDeal?.clientId));
  const selectedLead = leads.find((lead) => lead.id === (sourceRequest?.leadId ?? selectedDeal?.leadId));
  const activeForDeal = clientQuotations
    .filter((quotation) => quotation.dealId === queryDealId
      && (quotation.status === 'Draft' || quotation.status === 'Issued' && !isQuotationExpired(quotation)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const queryQuotation = clientQuotations.find((quotation) => quotation.id === queryQuotationId);
  const canCreateForDeal = dealRequests.some((request) =>
    request.sections.some((section) => section.status === 'Active' && lineIsEligibleForSection(request, section)));

  useEffect(() => {
    if (queryQuotationId) {
      const found = clientQuotations.find((quotation) => quotation.id === queryQuotationId);
      if (found) setEditor(found);
    }
  }, [clientQuotations, queryQuotationId]);

  useEffect(() => {
    if (autoOpened.current || query.get('create') !== '1' || !queryDealId || !canManage || !dealRequests.length) return;
    autoOpened.current = true;
    openWizard();
  // openWizard reads the current route's already-loaded data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDealId, queryRequestId, quotationRequests, canManage]);

  useEffect(() => {
    if (queryLineId && queryRequestId && sourceRequest?.id === queryRequestId) {
      const line = sourceRequest.lines.find((entry) => entry.id === queryLineId);
      const section = line && sourceRequest.sections.find((entry) => entry.id === line.sectionId);
      if (line && section) {
        setSelectedSectionIds([section.id]);
        const key = `${section.id}:${section.data.options.length ? section.data.options[0]?.id ?? '' : ''}`;
        setSelectedLines((current) => ({ ...current, [key]: line.id }));
      }
    }
  }, [queryLineId, queryRequestId, sourceRequest]);

  const getDeal = (dealId: string) => deals.find((deal) => deal.id === dealId);
  const preparedName = (id: string) => users.find((person) => person.id === id)?.name ?? id;
  const displayedReference = (quotation: ClientQuotation) =>
    `${quotation.reference}${quotation.version > 1 ? `-R${quotation.version - 1}` : ''}`;

  const recordQuotationActivity = (quotation: ClientQuotation, title: string, description: string) => {
    const timestamp = new Date().toISOString();
    setActivities((current) => [{
      id: `quotation-activity-${crypto.randomUUID()}`,
      clientId: '',
      leadId: quotation.leadId,
      dealId: quotation.dealId,
      type: 'note',
      title,
      description: `${displayedReference(quotation)}: ${description}`,
      date: timestamp,
      createdAt: timestamp,
      userId: user.id,
      actorName: user.name,
    }, ...current]);
  };

  function openWizard() {
    if (!canManage || !queryDealId) return;
    if (activeForDeal) {
      setEditor(activeForDeal);
      setWizardOpen(false);
      return;
    }
    if (!Number.isInteger(company.quotationValidityDays)
      || company.quotationValidityDays < 1
      || company.quotationValidityDays > 365) {
      setError('Set a client quotation validity from 1 to 365 days in Settings before creating a quotation.');
      return;
    }
    const request = dealRequests.find((entry) => entry.id === queryRequestId
      && entry.sections.some((section) => section.status === 'Active' && lineIsEligibleForSection(entry, section)))
      ?? dealRequests.find((entry) => entry.sections.some((section) =>
        section.status === 'Active' && lineIsEligibleForSection(entry, section)))
      ?? dealRequests.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!request) {
      setError('A client quotation can only be created from a deal with a QRS request.');
      return;
    }
    if (!request.sections.some((section) => section.status === 'Active' && lineIsEligibleForSection(request, section))) {
      setError('Create a client quotation after at least one active QRS section has an unexpired quoted line.');
      return;
    }
    const activeSections = request.sections.filter((section) => section.status === 'Active');
    setSelectedRequestId(request.id);
    setSelectedSectionIds(activeSections.filter((section) => lineIsEligibleForSection(request, section)).map((section) => section.id));
    setSelectedLines({
      ...defaultLowestPremiumSelections(request),
      ...(queryLineId && queryRequestId === request.id
        ? (() => {
          const line = request.lines.find((entry) => entry.id === queryLineId);
          const section = line && request.sections.find((entry) => entry.id === line.sectionId);
          if (!line || !section) return {};
          const optionKey = section.data.options[0]?.id ?? '';
          return { [`${section.id}:${optionKey}`]: line.id };
        })()
        : {}),
    });
    setClauseSelection(defaultClauseSelection(activeSections, company.quotationClauses));
    const contact = selectedClient?.contacts?.find((item) =>
      item.id === selectedDeal?.contactProfileId || item.id === selectedLead?.contactProfileId)
      ?? selectedClient?.contacts?.[0];
    setWizardContactId(contact?.id ?? '');
    setWizardDesignation(contact?.role ?? selectedDeal?.contactRole ?? '');
    setWizardAuthorizerId(users.find((person) => person.id !== user.id && person.role !== 'client')?.id ?? '');
    setValidityConfirmed(false);
    setWizardStep(0);
    setEditor(null);
    setError('');
    setWizardOpen(true);
  }

  const updateSourceRequest = (requestId: string) => {
    const request = quotationRequests.find((entry) => entry.id === requestId);
    setSelectedRequestId(requestId);
    setSelectedSectionIds([]);
    setSelectedLines(request ? defaultLowestPremiumSelections(request) : {});
    setClauseSelection(request ? defaultClauseSelection(request.sections, company.quotationClauses) : {});
    const client = request && clients.find((item) => item.id === request.clientId);
    setWizardContactId(client?.contacts?.[0]?.id ?? '');
    setWizardDesignation(client?.contacts?.[0]?.role ?? '');
    setValidityConfirmed(false);
  };

  const currentSources = useMemo(() => {
    if (!sourceRequest) return [];
    try {
      return buildClientQuotationSources(sourceRequest, selectedSectionIds, selectedLines);
    } catch {
      return [];
    }
  }, [sourceRequest, selectedSectionIds, selectedLines]);

  const makeClauseSetForSection = (section: QuotationSection): ClientQuotationClauseSet => {
    const source = getClauseSet(company.quotationClauses, section.productCode);
    return {
      ...source,
      perils: source.perils.filter((_, index) => clauseSelection[clauseKey(section.id, 'peril', index)] !== false),
      deductibles: source.deductibles.filter((_, index) => clauseSelection[clauseKey(section.id, 'deductible', index)] !== false),
      warranties: source.warranties.filter((_, index) => clauseSelection[clauseKey(section.id, 'warranty', index)] !== false),
      conditions: (source.conditions ?? []).filter((_, index) => clauseSelection[clauseKey(section.id, 'condition', index)] !== false),
      exclusions: source.exclusions.filter((_, index) => clauseSelection[clauseKey(section.id, 'exclusion', index)] !== false),
      communicableDiseaseExclusion: clauseSelection[clauseKey(section.id, 'communicableDiseaseExclusion', 0)] === false ? '' : source.communicableDiseaseExclusion,
      sanctionClause: clauseSelection[clauseKey(section.id, 'sanctionClause', 0)] === false ? '' : source.sanctionClause,
    };
  };

  const saveNewDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sourceRequest || !selectedDeal || !selectedClient || !selectedLead || !canManage) {
      setError('A client quotation requires a deal linked to a lead and client.');
      return;
    }
    if (activeForDeal) {
      setError('This deal already has an active draft or issued client quotation. Open it or create a revision.');
      return;
    }
    let sources: ClientQuotationSource[];
    try {
      sources = buildClientQuotationSources(sourceRequest, selectedSectionIds, selectedLines);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : String(selectionError));
      return;
    }
    const contact = selectedClient?.contacts?.find((item) => item.id === wizardContactId);
    const addressee = {
      contactId: contact?.id ?? '',
      name: contact?.name ?? selectedDeal.contactName ?? selectedLead.contact ?? '',
      designation: wizardDesignation || contact?.role || selectedDeal.contactRole || '',
    };
    const authorizer = wizardAuthorizerId;
    let draft: ClientQuotation;
    try {
      draft = createClientQuotationDraft({
        id: `client-quotation-${crypto.randomUUID()}`,
        reference: '',
        request: sourceRequest,
        sources,
        deal: selectedDeal,
        addressee,
        preparedBy: user.id,
        authorizedBy: authorizer,
        validityDays: company.quotationValidityDays,
        clausesForSection: (section) => makeClauseSetForSection(section),
      });
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : String(creationError));
      return;
    }
    const validationErrors = validateClientQuotation(draft, sourceRequest, company.requireDifferentQuotationAuthorizer, {
      confirmSourceValidity: validityConfirmed,
    });
    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      return;
    }
    let reference: string;
    try {
      reference = await getNextReference('client-quotation', new Date().getFullYear(), clientQuotations.map((item) => item.reference));
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : 'Could not allocate a client quotation reference.');
      return;
    }
    if (clientQuotations.some((quotation) => quotation.reference === reference)) {
      setError(`The allocated reference ${reference} already exists. No quotation was saved; request a new reference.`);
      return;
    }
    draft = { ...draft, reference };
    draft.sourceValidityConfirmed = validityConfirmed;
    setClientQuotations((current) => [draft, ...current]);
    recordQuotationActivity(draft, 'Client quotation draft created', `Created from ${sourceRequest.reference}.`);
    setEditor(draft);
    setWizardOpen(false);
    setError('');
    setNotice(`${displayedReference(draft)} saved as a draft.`);
  };

  const saveDraft = () => {
    if (!editor || !canManage || editor.status !== 'Draft') return;
    const request = quotationRequests.find((entry) => entry.id === editor.requestId);
    const saved: ClientQuotation = {
      ...editor,
      totalPremium: quotationTotalPremium(editor),
      totalSumInsured: quotationTotalSumInsured(editor),
      updatedAt: new Date().toISOString(),
      statusHistory: [...editor.statusHistory, {
        fromStatus: editor.status,
        toStatus: editor.status,
        changedAt: new Date().toISOString(),
        changedBy: user.id,
        note: 'Draft saved',
      }],
    };
    const validationErrors = validateClientQuotation(saved, request, company.requireDifferentQuotationAuthorizer, {
      confirmSourceValidity: validityConfirmed || saved.sourceValidityConfirmed,
    });
    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      return;
    }
    setClientQuotations((current) => current.map((item) => item.id === saved.id ? saved : item));
    setEditor(saved);
    recordQuotationActivity(saved, 'Client quotation draft saved', 'Draft details saved.');
    setError('');
    setNotice(`${displayedReference(saved)} draft saved.`);
  };

  const issueQuotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !canManage || editor.status !== 'Draft') return;
    const now = new Date().toISOString();
    const request = quotationRequests.find((entry) => entry.id === editor.requestId);
    const next: ClientQuotation = {
      ...editor,
      status: 'Draft',
      issuedAt: now,
      validUntil: defaultQuotationValidUntil(now, editor.validityDays),
      totalPremium: quotationTotalPremium(editor),
      totalSumInsured: quotationTotalSumInsured(editor),
    };
    const validationErrors = validateClientQuotation(next, request, company.requireDifferentQuotationAuthorizer, {
      forIssue: true,
      confirmSourceValidity: validityConfirmed,
    });
    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      return;
    }
    const issued: ClientQuotation = {
      ...next,
      status: 'Issued',
      updatedAt: now,
      sourceValidityConfirmed: validityConfirmed,
      statusHistory: [...next.statusHistory, {
        fromStatus: 'Draft',
        toStatus: 'Issued',
        changedAt: now,
        changedBy: user.id,
      }],
    };
    setClientQuotations((current) => current.map((item) => item.id === issued.id ? issued : item));
    setEditor(issued);
    recordQuotationActivity(issued, 'Client quotation issued', `Valid until ${issued.validUntil}.`);
    setError('');
    setNotice(`${displayedReference(issued)} issued.`);
  };

  const advanceDealAfterAcceptance = (quotation: ClientQuotation) => {
    const deal = getDeal(quotation.dealId);
    if (!deal) {
      setError('Quotation accepted, but the linked deal could not be found.');
      return;
    }
    const stages = pipelineStages.filter((stage) => stage.pipelineId === deal.pipelineId)
      .sort((left, right) => left.stageOrder - right.stageOrder);
    const currentIndex = stages.findIndex((stage) => stage.name === deal.stage);
    const currentStage = stages[currentIndex];
    const nextStage = stages[currentIndex + 1];
    if (!nextStage || nextStage.isClosedWon || nextStage.isClosedLost) return;
    const now = new Date().toISOString();
    setStageHistory((current) => [
      ...current.map((entry) => entry.dealId === deal.id && !entry.exitedAt ? {
        ...entry,
        exitedAt: now,
        durationSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(entry.enteredAt)) / 1000)),
      } : entry),
      {
        id: `quotation-accepted-stage-${crypto.randomUUID()}`,
        tenantId: TENANT_ID,
        dealId: deal.id,
        userId: user.id,
        userName: user.name,
        fromStageId: currentStage?.id ?? null,
        toStageId: nextStage.id,
        enteredAt: now,
        exitedAt: null,
        durationSeconds: null,
        details: `Advanced after client accepted ${displayedReference(quotation)}.`,
      },
    ]);
    setDeals((current) => current.map((item) => item.id === deal.id ? {
      ...item,
      stage: nextStage.name,
      stageChangedAt: now,
      probability: nextStage.winProbabilityPct,
      weighted: Math.round(item.value * nextStage.winProbabilityPct) / 100,
    } : item));
  };

  const transitionQuotation = (quotation: ClientQuotation, status: 'Accepted' | 'Rejected' | 'Expired') => {
    const expired = isQuotationExpired(quotation);
    if (!canTransitionClientQuotation(quotation.status, status, role, expired)) {
      setError(status === 'Accepted' && expired
        ? 'This quotation has expired and cannot be accepted.'
        : 'This quotation cannot make that status transition.');
      return;
    }
    if (status === 'Accepted' && !acceptanceName.trim()) {
      setError('Enter the accepting client representative’s name.');
      return;
    }
    const now = new Date().toISOString();
    const next: ClientQuotation = {
      ...quotation,
      status,
      updatedAt: now,
      ...(status === 'Accepted' ? {
        acceptance: { name: acceptanceName.trim(), designation: acceptanceDesignation.trim(), signedAt: now },
      } : {}),
      statusHistory: [...quotation.statusHistory, {
        fromStatus: quotation.status,
        toStatus: status,
        changedAt: now,
        changedBy: user.id,
      }],
    };
    setClientQuotations((current) => current.map((item) => item.id === quotation.id ? next : item));
    setEditor(next);
    recordQuotationActivity(next, `Client quotation ${status.toLowerCase()}`, status === 'Accepted'
      ? `Accepted by ${acceptanceName.trim()}${acceptanceDesignation.trim() ? `, ${acceptanceDesignation.trim()}` : ''}.`
      : `Status changed to ${status}.`);
    if (status === 'Accepted') advanceDealAfterAcceptance(next);
    setAcceptanceName('');
    setAcceptanceDesignation('');
    setError('');
    setNotice(`${displayedReference(quotation)} is ${status.toLowerCase()}.`);
  };

  const reviseQuotation = (quotation: ClientQuotation) => {
    if (!canManage || quotation.status === 'Accepted') return;
    const now = new Date().toISOString();
    const previousVersion = Math.max(...clientQuotations
      .filter((item) => item.reference === quotation.reference).map((item) => item.version));
    const revision: ClientQuotation = {
      ...quotation,
      id: `client-quotation-${crypto.randomUUID()}`,
      version: previousVersion + 1,
      status: 'Draft',
      issuedAt: now,
      validUntil: defaultQuotationValidUntil(now, quotation.validityDays),
      updatedAt: now,
      acceptance: undefined,
      sourceValidityConfirmed: false,
      statusHistory: [{
        toStatus: 'Draft',
        changedAt: now,
        changedBy: user.id,
        note: `Revision of version ${quotation.version}`,
      }],
    };
    const superseded = {
      ...quotation,
      status: 'Superseded' as const,
      updatedAt: now,
      statusHistory: [...quotation.statusHistory, {
        fromStatus: quotation.status,
        toStatus: 'Superseded' as const,
        changedAt: now,
        changedBy: user.id,
      }],
    };
    setClientQuotations((current) => [revision, ...current.map((item) => item.id === quotation.id ? superseded : item)]);
    setEditor(revision);
    recordQuotationActivity(superseded, 'Client quotation superseded', `Superseded by ${displayedReference(revision)}.`);
    recordQuotationActivity(revision, 'Client quotation revision created', `Revision ${revision.version} created.`);
    setError('');
  };

  const openQuotation = (quotation: ClientQuotation) => {
    setEditor(quotation);
    setWizardOpen(false);
    setError('');
  };

  const backToDealHref = dashboardHref('deals', {
    ...(editor?.dealId ?? queryDealId ? { deal: editor?.dealId ?? queryDealId } : {}),
    ...(query.get('dealView') ? { view: query.get('dealView')! } : {}),
  });

  const handleWizardNext = () => {
    if (!sourceRequest) {
      setError('Choose a source quotation request.');
      return;
    }
    if (wizardStep === 0) {
      if (!selectedSectionIds.length) {
        setError('Select at least one section to include.');
        return;
      }
      try {
        buildClientQuotationSources(sourceRequest, selectedSectionIds, selectedLines);
      } catch (selectionError) {
        setError(selectionError instanceof Error ? selectionError.message : String(selectionError));
        return;
      }
      setWizardStep(1);
    } else {
      setWizardStep(2);
    }
    setError('');
  };

  const editorRequest = editor ? quotationRequests.find((request) => request.id === editor.requestId) : undefined;
  const editorDeal = editor ? getDeal(editor.dealId) : undefined;
  const sourceWarnings = editor ? getSourceValidityWarnings(editor, quotationRequests) : [];
  const wizardValidUntil = sourceRequest && Number.isInteger(company.quotationValidityDays)
    && company.quotationValidityDays > 0
    ? defaultQuotationValidUntil(new Date().toISOString(), company.quotationValidityDays)
    : '';
  const wizardValidityWarnings = sourceRequest && wizardValidUntil
    ? getSourceValidityWarnings({
      requestId: sourceRequest.id,
      sources: currentSources,
      validUntil: wizardValidUntil,
    }, [sourceRequest])
    : [];
  const validityWarningRequired = editor
    ? sourceValidityConfirmationRequired(editor, quotationRequests)
    : false;
  const editorErrors = editor
    ? validateClientQuotation(editor, editorRequest, company.requireDifferentQuotationAuthorizer, {
      forIssue: true,
      confirmSourceValidity: validityConfirmed,
    })
    : [];

  if (!canManage) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted">Client Quotations are available to Admin and Sales users.</div>;
  }

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="rounded-lg border border-win/30 bg-win/10 px-4 py-2 text-sm text-win">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-hot/30 bg-hot/10 px-4 py-2 text-sm text-hot">{error}</div>}

      <PageToolbar name="client-quotations">
        {editor && <button type="button" className="btn-ghost" onClick={() => setEditor(null)}><ArrowLeft size={14} /> All quotations</button>}
        <h1 className="mr-auto text-lg font-bold text-white">{editor ? displayedReference(editor) : 'Client Quotations'}</h1>
        {editor && <button type="button" className="btn-ghost" onClick={() => printDocument('print-client-quotation')}><Printer size={14} /> Print / Save PDF</button>}
        {!editor && queryDealId && activeForDeal && <button type="button" className="btn-primary" onClick={() => openQuotation(activeForDeal)}>Open client quotation</button>}
        {!editor && queryDealId && !activeForDeal && canCreateForDeal && <button type="button" className="btn-primary" onClick={openWizard}><FilePlus2 size={14} /> Create client quotation</button>}
        {editor && ['Issued', 'Rejected', 'Expired'].includes(editor.status) && <button type="button" className="btn-ghost" onClick={() => reviseQuotation(editor)}><RefreshCw size={14} /> Revise</button>}
        {editor && <a className="btn-ghost" href={backToDealHref}>Back to deal</a>}
      </PageToolbar>

      {wizardOpen && sourceRequest && selectedDeal && (
        <section className="glass space-y-4 rounded-2xl p-4 sm:p-6" aria-label="Client quotation creation wizard">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold text-white">Create client quotation</h2><p className="mt-1 text-xs text-muted">Step {wizardStep + 1} of 3 · {['Select sections and carrier quotes', 'Review copied details and clauses', 'Addressee and save draft'][wizardStep]}</p></div>
            <button type="button" className="btn-ghost" onClick={() => { setWizardOpen(false); setError(''); }}>Cancel</button>
          </div>
          <div className="h-1 overflow-hidden rounded bg-ink-700"><div className="h-full bg-accent transition-all" style={{ width: `${((wizardStep + 1) / 3) * 100}%` }} /></div>

          {wizardStep === 0 && <>
            {dealRequests.length > 1 && <label className="block max-w-lg text-xs text-muted">Source QRS
              <select className="input mt-1" value={sourceRequest.id} onChange={(event) => updateSourceRequest(event.target.value)}>
                {dealRequests.map((request) => <option key={request.id} value={request.id}>{request.reference} · {formatDate(request.issuedAt)}</option>)}
              </select>
            </label>}
            <p className="text-sm text-muted">Choose sections and one quoted carrier for each cover or option. Premium, rate, validity, and deductible notes are shown for comparison.</p>
            <div className="space-y-3">
              {sourceRequest.sections.filter((section) => section.status === 'Active').map((section) => {
                const included = selectedSectionIds.includes(section.id);
                const options = section.data.options.length ? section.data.options : [{ id: '', label: 'Section premium', coverages: [] }];
                const sectionReady = lineIsEligibleForSection(sourceRequest, section);
                return <article key={section.id} className="rounded-xl border border-ink-700 bg-ink-900/50 p-3">
                  <label className="flex items-start gap-2 text-sm font-medium text-white">
                    <input type="checkbox" checked={included} onChange={(event) => setSelectedSectionIds((current) =>
                      event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} />
                    <span>{section.no}. {section.title} <span className="text-xs text-muted">· {section.productCode}</span></span>
                  </label>
                  {!sectionReady && <p className="mt-2 text-xs text-muted">This section does not currently have an unexpired quote for every option.</p>}
                  {included && options.map((option) => {
                    const selectionKey = `${section.id}:${option.id}`;
                    const lines = sourceRequest.lines.filter((line) =>
                      line.sectionId === section.id && line.status === 'Quoted' && quoteForSource(line, option.id || undefined));
                    return <div key={selectionKey} className="mt-3 min-w-0">
                      <h3 className="mb-2 text-xs font-semibold text-white">{option.label}</h3>
                      <div className="overflow-x-auto rounded-lg border border-ink-700">
                        <table className="w-full min-w-[680px] text-left text-xs">
                          <thead className="bg-ink-800 text-muted"><tr><th className="p-2">Select / insurer</th><th className="p-2">Premium</th><th className="p-2">Rate</th><th className="p-2">Valid until</th><th className="p-2">Deductible notes</th></tr></thead>
                          <tbody>{lines.map((line) => {
                            const quote = quoteForSource(line, option.id || undefined)!;
                            const insurerName = vendors.find((vendor) => vendor.id === line.vendorId)?.name ?? line.vendorId;
                            return <tr key={line.id} className="border-t border-ink-700">
                              <td className="p-2"><label className="flex items-center gap-2"><input type="radio" name={selectionKey} checked={selectedLines[selectionKey] === line.id} onChange={() => setSelectedLines((current) => ({ ...current, [selectionKey]: line.id }))} /><span>{line.reference} · {insurerName}</span></label></td>
                              <td className="p-2 text-white">{formatAmount(quote.premium, quote.currency)}</td>
                              <td className="p-2">{quotationRatePct(quote.premium, section.data.totalSumInsured)}%</td>
                              <td className="p-2">{quote.validUntil ? formatDate(quote.validUntil) : 'Not specified'}</td>
                              <td className="p-2">{line.insurerDeductibles?.join('; ') || '—'}</td>
                            </tr>;
                          })}</tbody>
                        </table>
                      </div>
                      {!lines.length && <p className="mt-2 text-xs text-muted">No quoted line is available for this option.</p>}
                    </div>;
                  })}
                </article>;
              })}
            </div>
          </>}

          {wizardStep === 1 && <div className="space-y-4">
            <div className="rounded-xl border border-ink-700 p-3">
              <h3 className="font-semibold text-white">Copied risk details</h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <Detail label="Insured" value={sourceRequest.insuredName} />
                <Detail label="Occupation" value={sourceRequest.occupation || sourceRequest.businessActivity} />
                <Detail label="Risk location" value={sourceRequest.riskLocation} />
                <Detail label="Territorial limits" value={sourceRequest.territorialLimits} />
                <Detail label="Policy period" value={sourceRequest.periodOfInsurance} />
              </dl>
            </div>
            {sourceRequest.sections.filter((section) => selectedSectionIds.includes(section.id)).map((section) => {
              const clauses = getClauseSet(company.quotationClauses, section.productCode);
              const sectionSources = currentSources.filter((source) => source.sectionId === section.id);
              const selectionGroups = [
                { name: 'Covered perils', group: 'peril', values: clauses.perils },
                { name: 'Deductibles', group: 'deductible', values: clauses.deductibles.map((item) => `${item.label} | ${item.text}`) },
                { name: 'Warranties', group: 'warranty', values: clauses.warranties.map((item) => `${item.title} | ${item.text}`) },
                { name: 'Conditions', group: 'condition', values: clauses.conditions ?? [] },
                { name: 'Exclusions', group: 'exclusion', values: clauses.exclusions },
                { name: 'Communicable-disease exclusion', group: 'communicableDiseaseExclusion', values: clauses.communicableDiseaseExclusion ? [clauses.communicableDiseaseExclusion] : [] },
                { name: 'Sanctions clause', group: 'sanctionClause', values: clauses.sanctionClause ? [clauses.sanctionClause] : [] },
              ];
              return <article key={section.id} className="rounded-xl border border-ink-700 p-3">
                <h3 className="font-semibold text-white">{section.title} · {section.productCode}</h3>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-ink-900/50 p-3">
                    <p className="font-semibold text-white">Risk details</p>
                    {section.data.interests.map((interest, index) => <p key={`${interest.interest}-${index}`} className="mt-1 text-muted">{interest.interest}: {formatAmount(interest.sumInsured, sourceRequest.currency)}</p>)}
                    {section.data.businessInterruption && <p className="mt-1 text-muted">Business interruption: {formatAmount(section.data.businessInterruption.grossProfit, sourceRequest.currency)} gross profit · {section.data.businessInterruption.indemnityMonths} months</p>}
                    <p className="mt-1 text-white">Total sum insured: {formatAmount(section.data.totalSumInsured, sourceRequest.currency)}</p>
                    {section.data.extensions.map((extension, index) => <p key={`${extension.name}-${index}`} className="mt-1 text-muted">Extension: {extension.name} · {extension.limit || 'No limit specified'}</p>)}
                  </div>
                  <div className="rounded-lg bg-ink-900/50 p-3">
                    <p className="font-semibold text-white">Selected carrier sources</p>
                    {sectionSources.map((source) => {
                      const chosen = quoteFromSource(sourceRequest, source);
                      return <p key={`${source.lineId}:${source.optionKey ?? ''}`} className="mt-1 text-muted">
                        {source.optionKey ? `${section.data.options.find((option) => option.id === source.optionKey)?.label ?? source.optionKey} · ` : ''}
                        {chosen?.line.reference} · {chosen?.quote ? formatAmount(chosen.quote.premium, chosen.quote.currency) : 'Quote unavailable'}
                        {chosen?.quote?.validUntil ? ` · valid until ${formatDate(chosen.quote.validUntil)}` : ''}
                      </p>;
                    })}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selectionGroups.map((group) => group.values.length > 0 && <fieldset key={group.group} className="rounded-lg bg-ink-900/50 p-3">
                    <legend className="text-xs font-semibold text-muted">{group.name}</legend>
                    <div className="mt-2 space-y-2">{group.values.map((value, index) => <label key={`${group.group}-${index}`} className="flex gap-2 text-xs text-white">
                      <input type="checkbox" checked={clauseSelection[clauseKey(section.id, group.group, index)] !== false} onChange={(event) => setClauseSelection((current) => ({ ...current, [clauseKey(section.id, group.group, index)]: event.target.checked }))} />
                      <span>{value}</span>
                    </label>)}</div>
                  </fieldset>)}
                </div>
                <p className="mt-2 text-xs text-muted">Disclaimer: {clauses.disclaimer}</p>
              </article>;
            })}
          </div>}

          {wizardStep === 2 && <form id="client-quotation-wizard-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveNewDraft(event)}>
            <div className="sm:col-span-2 rounded-xl border border-ink-700 p-3">
              <h3 className="font-semibold text-white">Review totals</h3>
              {currentSources.map((source) => {
                const selected = quoteFromSource(sourceRequest, source);
                const section = sourceRequest.sections.find((entry) => entry.id === source.sectionId);
                return <p key={`${source.sectionId}:${source.optionKey ?? ''}`} className="mt-1 text-sm text-muted">
                  {section?.title}{source.optionKey ? ` · ${source.optionKey}` : ''}: {selected?.line.reference} · {selected?.quote ? formatAmount(selected.quote.premium, selected.quote.currency) : 'Quote unavailable'}
                </p>;
              })}
              <p className="mt-2 text-sm text-white">Insured: {sourceRequest.insuredName} · {selectedClient?.name}</p>
            </div>
            <label className="block text-xs text-muted">Addressee
              <select className="input mt-1" value={wizardContactId} onChange={(event) => setWizardContactId(event.target.value)} required>
                <option value="" disabled>Select contact</option>
                {(selectedClient?.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted">Addressee designation
              <input className="input mt-1" value={wizardDesignation} onChange={(event) => setWizardDesignation(event.target.value)} />
            </label>
            <label className="block text-xs text-muted">Prepared by
              <input className="input mt-1" value={user.name} readOnly />
            </label>
            <label className="block text-xs text-muted">Authorized by
              <select className="input mt-1" value={wizardAuthorizerId} onChange={(event) => setWizardAuthorizerId(event.target.value)}>
                <option value="">Select authorizer</option>
                {users.filter((person) => person.id !== user.id && person.role !== 'client').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            {wizardValidityWarnings.length > 0 && <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-100">
              <input type="checkbox" checked={validityConfirmed} onChange={(event) => setValidityConfirmed(event.target.checked)} />
              <span>{wizardValidityWarnings.join(' ')} Explicitly confirm proceeding.</span>
            </label>}
            <p className="sm:col-span-2 text-xs text-muted">This saves a draft only. Issuance requires an authorized approver and may require renewed source-validity confirmation.</p>
          </form>}

          {wizardStep < 2
            ? <div className="flex justify-end gap-2"><button type="button" className="btn-primary" onClick={handleWizardNext}>Continue</button></div>
            : <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className="btn-ghost" onClick={() => setWizardStep(1)}>Back</button>
              <button type="submit" form="client-quotation-wizard-form" className="btn-primary"><Save size={14} /> Save as Draft</button>
            </div>}
        </section>
      )}

      {!editor && !wizardOpen && <>
        {query.get('quotationId') && !queryQuotation && <div role="status" className="rounded-lg border border-ink-700 p-4 text-sm text-muted">Client quotation not found.</div>}
        {queryDealId && <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
          <div><p className="text-sm font-semibold text-white">{selectedDeal?.product ?? 'Deal not found'}</p><p className="text-xs text-muted">{selectedClient?.name ?? 'Client unavailable'} · {selectedLead?.client ?? 'Lead unavailable'}</p></div>
          {activeForDeal ? <button type="button" className="btn-primary" onClick={() => openQuotation(activeForDeal)}>Open client quotation</button>
            : canCreateForDeal && <button type="button" className="btn-primary" onClick={openWizard}><FilePlus2 size={14} /> Create client quotation</button>}
        </div>}
        {queryDealId && !activeForDeal && !canCreateForDeal && <p role="status" className="rounded-lg border border-ink-700 p-3 text-xs text-muted">A client quotation becomes available after an active QRS section has an unexpired quoted carrier line.</p>}
        <div className="glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr className="border-b border-ink-700"><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Client / deal</th><th className="px-4 py-3">Sections</th><th className="px-4 py-3">Total premium</th><th className="px-4 py-3">Valid until</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Open</th></tr></thead>
              <tbody>{visibleQuotations.map((quotation) => {
                const deal = getDeal(quotation.dealId);
                return <tr key={quotation.id} className="border-b border-ink-800">
                  <td className="px-4 py-3 font-medium text-white">{displayedReference(quotation)}</td>
                  <td className="px-4 py-3">{clients.find((client) => client.id === quotation.clientId)?.name ?? deal?.client ?? '—'}<div className="text-xs text-muted">{deal?.product ?? 'Deal unavailable'}</div></td>
                  <td className="px-4 py-3">{quotation.sections.length}</td>
                  <td className="px-4 py-3 text-white">{formatAmount(quotationTotalPremium(quotation), quotation.currency)}</td>
                  <td className="px-4 py-3">{formatDate(quotation.validUntil)}</td>
                  <td className="px-4 py-3"><Badge variant={visibleStatus(quotation) === 'Accepted' ? 'win' : visibleStatus(quotation) === 'Expired' || visibleStatus(quotation) === 'Rejected' ? 'warm' : 'brand'}>{visibleStatus(quotation)}</Badge></td>
                  <td className="px-4 py-3"><button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openQuotation(quotation)}>Open</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!visibleQuotations.length && <p className="p-6 text-sm text-muted">No client quotations have been created from a deal.</p>}
        </div>
      </>}

      {editor && <section className="space-y-4">
        <div className="glass grid gap-4 rounded-2xl p-4 sm:grid-cols-2 sm:p-6">
          <div><p className="text-xs uppercase text-muted">Client / deal</p><p className="mt-1 font-semibold text-white">{clients.find((client) => client.id === editor.clientId)?.name ?? editor.insuredName}</p><p className="text-sm text-muted">{editorDeal?.product ?? 'Deal unavailable'} · QRS {editorRequest?.reference ?? 'unavailable'}</p></div>
          <div className="sm:text-right"><Badge variant={visibleStatus(editor) === 'Accepted' ? 'win' : visibleStatus(editor) === 'Expired' || visibleStatus(editor) === 'Rejected' ? 'warm' : 'brand'}>{visibleStatus(editor)}</Badge><p className="mt-2 text-sm text-muted">{editor.issuedAt ? `Date ${formatDate(editor.issuedAt)}` : 'Draft'} · valid until {formatDate(editor.validUntil)}</p></div>
          <dl className="grid gap-3 text-sm sm:col-span-2 sm:grid-cols-3">
            <Detail label="Insured" value={editor.insuredName} />
            <Detail label="Risk location" value={editor.riskLocation} />
            <Detail label="Territorial limits" value={editor.territorialLimits} />
            <Detail label="Occupation" value={editor.occupation} />
            <Detail label="Policy period" value={editor.policyPeriod} />
            <Detail label="Prepared by" value={preparedName(editor.preparedBy)} />
            <Detail label="Authorized by" value={editor.authorizedBy ? preparedName(editor.authorizedBy) : 'Not assigned'} />
            <Detail label="Total sum insured" value={formatAmount(quotationTotalSumInsured(editor), editor.currency)} />
            <Detail label="Total premium" value={formatAmount(quotationTotalPremium(editor), editor.currency)} />
          </dl>
          {editor.sections.some((section) => section.optionQuotes.length > 0) && <p className="text-xs text-muted sm:col-span-2">Total premium uses the lowest quoted option for each option-based section; alternatives are shown separately below.</p>}
        </div>

        {editor.status === 'Draft' && canManage && <div className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
          <label className="block text-xs text-muted">Addressee
            <select className="input mt-1" value={editor.addressee.contactId} onChange={(event) => {
              const contact = clients.find((client) => client.id === editor.clientId)?.contacts?.find((item) => item.id === event.target.value);
              setEditor({ ...editor, addressee: { contactId: event.target.value, name: contact?.name ?? '', designation: contact?.role ?? '' } });
            }}>
              <option value="">Select contact</option>
              {(clients.find((client) => client.id === editor.clientId)?.contacts ?? []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">Addressee designation
            <input className="input mt-1" value={editor.addressee.designation} onChange={(event) => setEditor({ ...editor, addressee: { ...editor.addressee, designation: event.target.value } })} />
          </label>
          <label className="block text-xs text-muted">Authorized by
            <select className="input mt-1" value={editor.authorizedBy} onChange={(event) => setEditor({ ...editor, authorizedBy: event.target.value })}>
              <option value="">Select authorizer</option>
              {users.filter((person) => person.role !== 'client').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">Validity days
            <input className="input mt-1" type="number" min="1" max="365" value={editor.validityDays} onChange={(event) => {
              const validityDays = Number(event.target.value);
              if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) return;
              const issuedAt = editor.issuedAt ?? editor.createdAt;
              setEditor({ ...editor, validityDays, validUntil: defaultQuotationValidUntil(issuedAt, validityDays) });
            }} />
          </label>
          {validityWarningRequired && <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-100">
            <input type="checkbox" checked={validityConfirmed} onChange={(event) => setValidityConfirmed(event.target.checked)} />
            <span>{sourceWarnings.join(' ')} Confirm explicitly to continue.</span>
          </label>}
          {editorErrors.length > 0 && <p className="sm:col-span-2 text-xs text-muted">{editorErrors.join(' ')}</p>}
          <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={saveDraft}><Save size={14} /> Save draft</button>
            <form onSubmit={issueQuotation}><button type="submit" className="btn-primary"><Send size={14} /> Issue quotation</button></form>
          </div>
        </div>}

        <div className="space-y-3">
          {editor.sections.map((section) => <QuotationSectionCard key={section.sectionId} section={section} currency={editor.currency} />)}
        </div>
        <article className="client-quotation-print glass rounded-2xl bg-white p-5 text-slate-900 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div><h2 className="text-xl font-bold">{company.legalName || company.name || 'Premier Brokers Pvt. Ltd.'}</h2><p>{company.address}</p><p>{company.phone} · {company.email}</p></div>
            <div className="text-right"><h1 className="text-2xl font-bold">QUOTATION</h1><p>{displayedReference(editor)}</p><p>Date: {editor.issuedAt ? formatDate(editor.issuedAt) : formatDate(editor.createdAt)}</p></div>
          </header>
          <section className="grid gap-3 py-4 sm:grid-cols-2">
            <PrintField label="To" value={editor.addressee.name} /><PrintField label="Designation" value={editor.addressee.designation} />
            <PrintField label="Insured" value={editor.insuredName} /><PrintField label="Occupation" value={editor.occupation} />
            <PrintField label="Risk location" value={editor.riskLocation} /><PrintField label="Territorial limits" value={editor.territorialLimits} />
            <PrintField label="Policy / endorsement" value={`${editor.policyNo} / ${editor.endorsementNo}`} /><PrintField label="Policy period" value={editor.policyPeriod} />
          </section>
          {editor.sections.map((section) => <PrintQuotationSection key={section.sectionId} section={section} currency={editor.currency} />)}
          <div className="mt-4 border-y border-slate-400 py-3 text-right"><p>Total sum insured: {formatAmount(quotationTotalSumInsured(editor), editor.currency)}</p><strong>Total premium: {formatAmount(quotationTotalPremium(editor), editor.currency)}</strong>{editor.sections.some((section) => section.optionQuotes.length > 0) && <p className="mt-1 text-xs">Option-based section total uses the lowest selected premium; alternatives are listed separately.</p>}</div>
          <p className="mt-4 text-xs">{editor.disclaimer}</p><p className="mt-2 text-xs">This quotation is valid until {formatDate(editor.validUntil)}.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2"><PrintField label="Prepared by" value={preparedName(editor.preparedBy)} /><PrintField label="Authorized by" value={preparedName(editor.authorizedBy)} /></div>
          <section className="mt-6 border border-slate-400 p-4"><h3 className="font-semibold">Client confirmation</h3>
            {editor.acceptance ? <p className="mt-2">Accepted by {editor.acceptance.name}{editor.acceptance.designation ? `, ${editor.acceptance.designation}` : ''} on {formatDate(editor.acceptance.signedAt)}.</p> : <p className="mt-2">I confirm acceptance of the quotation terms above.</p>}
            {!editor.acceptance && editor.status === 'Issued' && !isQuotationExpired(editor) && <form className="mt-3 grid gap-2 print:hidden sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); transitionQuotation(editor, 'Accepted'); }}>
              <label className="text-xs">Name *<input className="input" required value={acceptanceName} onChange={(event) => setAcceptanceName(event.target.value)} /></label>
              <label className="text-xs">Designation<input className="input" value={acceptanceDesignation} onChange={(event) => setAcceptanceDesignation(event.target.value)} /></label>
              <button type="submit" className="btn-primary !py-1.5 text-xs sm:col-span-2"><Check size={13} /> Record acceptance</button>
            </form>}
          </section>
        </article>
        {editor.status === 'Issued' && canManage && <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => transitionQuotation(editor, 'Rejected')}>Mark rejected</button>
          {isQuotationExpired(editor) && <button type="button" className="btn-ghost text-xs" onClick={() => transitionQuotation(editor, 'Expired')}>Mark expired</button>}
        </div>}
      </section>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-white">{value || '—'}</dd></div>;
}

function QuotationSectionCard({ section, currency }: { section: ClientQuotationSection; currency: 'MVR' | 'USD' }) {
  return <article className="glass overflow-hidden rounded-2xl p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-muted">{section.productCode}</p><h2 className="font-semibold text-white">{section.title}</h2></div><Badge>{section.insurerLineReference}</Badge></div>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-muted"><tr><th className="py-2">Insured interest</th><th className="py-2 text-right">Sum insured</th><th className="py-2 text-right">Weight</th></tr></thead>
      <tbody>{section.interests.map((interest, index) => <tr key={`${interest.interest}-${index}`} className="border-t border-ink-700"><td className="py-2">{interest.interest}</td><td className="py-2 text-right">{formatAmount(interest.sumInsured, currency)}</td><td className="py-2 text-right">{section.totalSumInsured > 0 ? `${(interest.sumInsured / section.totalSumInsured * 100).toFixed(2)}%` : '—'}</td></tr>)}</tbody>
    </table></div>
    {section.businessInterruption && <p className="mt-2 text-sm text-muted">Business interruption · Gross profit {formatAmount(section.businessInterruption.grossProfit, currency)} · {section.businessInterruption.indemnityMonths} months</p>}
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Detail label="Section total sum insured" value={formatAmount(section.totalSumInsured, currency)} /><Detail label="Indicative premium / rate" value={`${formatAmount(section.proposedPremium, currency)} · ${section.ratePct}%`} /><Detail label="Carrier quote valid until" value={section.sourceValidUntil ? formatDate(section.sourceValidUntil) : 'Not specified'} /></div>
    {section.optionQuotes.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-muted"><tr><th className="py-2">Option</th><th className="py-2">Carrier reference</th><th className="py-2 text-right">Premium</th><th className="py-2 text-right">Rate</th><th className="py-2">Carrier validity</th></tr></thead><tbody>{section.optionQuotes.map((option) => <tr key={option.optionKey} className="border-t border-ink-700"><td className="py-2">{option.label}</td><td className="py-2">{option.insurerLineReference}</td><td className="py-2 text-right">{formatAmount(option.proposedPremium, currency)}</td><td className="py-2 text-right">{option.ratePct}%</td><td className="py-2">{option.sourceValidUntil ? formatDate(option.sourceValidUntil) : 'Not specified'}</td></tr>)}</tbody></table></div>}
    <ClauseList title="Perils" values={section.perils} />
    <ClauseList title="Extensions" values={section.extensions.map((item) => `${item.name}: ${item.limit}`)} />
    <ClauseList title="Deductibles" values={section.deductibles.map((item) => `${item.label}: ${item.text}`)} />
    <ClauseList title="Warranties" values={section.warranties.map((item) => `${item.title}: ${item.text}`)} />
    <ClauseList title="Conditions" values={section.conditions} />
    <ClauseList title="Exclusions" values={section.exclusions} />
  </article>;
}

function ClauseList({ title, values }: { title: string; values: string[] }) {
  return values.length ? <div className="mt-3"><h3 className="text-xs font-semibold text-muted">{title}</h3><ul className="mt-1 list-inside list-disc space-y-1 text-sm text-white">{values.map((value, index) => <li key={`${title}-${index}`}>{value}</li>)}</ul></div> : null;
}

function PrintField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="font-medium">{value || '—'}</div></div>;
}

function PrintQuotationSection({ section, currency }: { section: ClientQuotationSection; currency: 'MVR' | 'USD' }) {
  return <section className="mt-4 border-t border-slate-300 pt-3">
    <h2 className="font-bold">{section.title} ({section.productCode})</h2>
    <table className="mt-2 w-full border-collapse text-sm"><thead><tr className="border-y border-slate-400"><th className="py-2 text-left">Insured interest</th><th className="py-2 text-right">Sum insured</th></tr></thead><tbody>
      {section.interests.map((interest, index) => <tr key={`${interest.interest}-${index}`} className="border-b border-slate-200"><td className="py-2">{interest.interest}</td><td className="py-2 text-right">{formatAmount(interest.sumInsured, currency)}</td></tr>)}
      <tr className="font-bold"><td className="py-2">Section total</td><td className="py-2 text-right">{formatAmount(section.totalSumInsured, currency)}</td></tr>
    </tbody></table>
      {section.businessInterruption && <p className="mt-2 text-sm">Business interruption: {formatAmount(section.businessInterruption.grossProfit, currency)} gross profit · {section.businessInterruption.indemnityMonths} month indemnity period.</p>}
      {!section.optionQuotes.length && <p className="mt-2 text-sm">Carrier quote valid until {section.sourceValidUntil ? formatDate(section.sourceValidUntil) : 'not specified'}.</p>}
    {section.optionQuotes.map((option) => <p key={option.optionKey} className="mt-2 text-sm">{option.label}: {formatAmount(option.proposedPremium, currency)} ({option.ratePct}%) · {option.insurerLineReference} · carrier validity {option.sourceValidUntil ? formatDate(option.sourceValidUntil) : 'not specified'}</p>)}
    <PrintList title="Perils" items={section.perils} /><PrintList title="Extensions" items={section.extensions.map((item) => `${item.name}: ${item.limit}`)} />
    <PrintList title="Deductibles" items={section.deductibles.map((item) => `${item.label}: ${item.text}`)} /><PrintList title="Warranties" items={section.warranties.map((item) => `${item.title}: ${item.text}`)} />
    <PrintList title="Conditions" items={section.conditions} /><PrintList title="Exclusions" items={section.exclusions} />
  </section>;
}

function PrintList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <section className="mt-3"><h3 className="font-semibold">{title}</h3><ul className="mt-1 list-disc pl-5 text-sm">{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></section> : null;
}
