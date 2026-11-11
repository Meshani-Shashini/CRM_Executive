import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, FilePlus2, Printer, RefreshCw, Send } from 'lucide-react';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import { useApp } from '../store/AppContext';
import type { ClientQuotation, ClientQuotationStatus, QuotationRequest, QuotationRequestLine } from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import {
  canTransitionClientQuotation, createClientQuotationDraft, defaultQuotationValidUntil,
  findQuotedSourceLine, isQuotationExpired, quotationRatePct, quotationTotalSumInsured,
  validateClientQuotation,
} from '../utils/clientQuotations';
import { hashParams } from '../utils/navigation';
import { printDocument } from '../utils/print';
import { getNextReference } from '../utils/references';
import { AUTH_BYPASS, supabase, TENANT_ID } from '../lib/supabase';

function splitRows(value: string) {
  return value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
}

function parseLabelPairs(value: string) {
  return splitRows(value).map((row) => {
    const [first, ...rest] = row.split('|');
    return { label: first.trim(), text: rest.join('|').trim() };
  });
}

function parseTitlePairs(value: string) {
  return splitRows(value).map((row) => {
    const [first, ...rest] = row.split('|');
    return { title: first.trim(), text: rest.join('|').trim() };
  });
}

function serializePairs(values: Array<{ label: string; text: string }>) {
  return values.map(({ label, text }) => `${label} | ${text}`).join('\n');
}

function serializeWarranties(values: Array<{ title: string; text: string }>) {
  return values.map(({ title, text }) => `${title} | ${text}`).join('\n');
}

function visibleStatus(quotation: ClientQuotation): ClientQuotationStatus {
  return quotation.status === 'Issued' && isQuotationExpired(quotation) ? 'Expired' : quotation.status;
}

export default function ClientQuotationsPage() {
  const {
    clientQuotations, setClientQuotations, quotationRequests, deals, leads, clients,
    company, user, users, viewAsRole, pipelineStages, setStageHistory,
    setDeals, setActivities,
  } = useApp();
  const role = viewAsRole ?? user.role;
  const canIssue = role === 'admin' || role === 'sales';
  const [editor, setEditor] = useState<ClientQuotation | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [preserveValidUntil, setPreserveValidUntil] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acceptanceName, setAcceptanceName] = useState('');
  const [acceptanceDesignation, setAcceptanceDesignation] = useState('');

  const visibleQuotations = clientQuotations
    .filter((quotation) => role !== 'client' || quotation.clientId === user.clientId)
    .sort((left, right) => right.reference.localeCompare(left.reference) || right.version - left.version);
  const quotedLineOptions = useMemo(() => quotationRequests.flatMap((request) =>
    request.lines.filter((line) => line.status === 'Quoted').map((line) => ({ request, line }))), [quotationRequests]);
  const query = hashParams();
  const queryDealId = query.get('dealId') ?? '';
  const queryRequestId = query.get('requestId') ?? '';
  const queryLineId = query.get('lineId') ?? '';

  useEffect(() => {
    if (!queryDealId || role === 'client') return;
    const source = findQuotedSourceLine(quotationRequests, queryRequestId, queryLineId);
    if (source && source.request.dealId === queryDealId) {
      setSelectedRequestId(source.request.id);
      setSelectedLineId(source.line.id);
    }
  }, [queryDealId, queryLineId, queryRequestId, quotationRequests, role]);

  const getDeal = (dealId: string) => deals.find((deal) => deal.id === dealId);
  const getClient = (clientId: string) => clients.find((client) => client.id === clientId);
  const preparedName = (id: string) => users.find((person) => person.id === id)?.name ?? id;
  const openDraftFromLine = async (request: QuotationRequest, line: QuotationRequestLine) => {
    if (!canIssue) return;
    if (!line.validUntil && (!Number.isInteger(company.quotationValidityDays) || company.quotationValidityDays < 1)) {
      setError('Default quotation validity days must be a positive whole number.');
      return;
    }
    if (clientQuotations.some((quotation) => quotation.sourceLineId === line.id)) {
      setError('A client quotation already exists for this QRS line. Create a revision from the existing quotation.');
      return;
    }
    const deal = getDeal(request.dealId);
    const client = getClient(request.clientId);
    const lead = leads.find((item) => item.id === request.leadId);
    if (!deal || !client || !lead || line.status !== 'Quoted') {
      setError('A client quotation requires a valid deal, linked lead and client, and a Quoted QRS line.');
      return;
    }
    const contact = client.contacts?.find((item) => item.id === deal.contactProfileId)
      ?? client.contacts?.find((item) => item.id === lead.contactProfileId)
      ?? client.contacts?.find((item) => item.linkedLeadIds?.includes(lead.id) || item.linkedDealIds?.includes(deal.id));
    const authorizer = users.find((person) => person.id !== user.id && person.role !== 'client')?.id
      ?? '';
    let reference: string;
    try {
      reference = await getNextReference('client-quotation', new Date().getFullYear(), clientQuotations.map((item) => item.reference));
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : 'Could not allocate a quotation reference.');
      return;
    }
    const clauseSet = company.quotationClauses[deal.productCode ?? ''] ?? company.quotationClauses.default;
    const quotation = createClientQuotationDraft({
      id: `client-quotation-${crypto.randomUUID()}`,
      reference,
      request,
      line,
      deal,
      addressee: {
        contactId: contact?.id ?? deal.contactProfileId ?? '',
        name: contact?.name ?? deal.contactName ?? lead.contact,
        designation: contact?.role ?? deal.contactRole ?? 'Decision Maker',
      },
      preparedBy: user.id,
      authorizedBy: authorizer,
      validityDays: company.quotationValidityDays,
      template: clauseSet,
    });
    setClientQuotations((current) => [quotation, ...current]);
    recordQuotationActivity(quotation, 'Client quotation draft created', `${quotation.reference} created from ${line.reference}.`);
    setEditor(quotation);
    setEditorMode('create');
    setPreserveValidUntil(Boolean(line.validUntil));
    setError('');
  };

  const reviseQuotation = (quotation: ClientQuotation) => {
    if (!canIssue) return;
    const source = findQuotedSourceLine(quotationRequests, quotation.sourceRequestId, quotation.sourceLineId);
    if (!source) {
      setError('The source QRS line is no longer Quoted; this quotation cannot be revised.');
      return;
    }
    const revision: ClientQuotation = {
      ...quotation,
      id: `client-quotation-${crypto.randomUUID()}`,
      version: Math.max(...clientQuotations.filter((item) => item.reference === quotation.reference).map((item) => item.version)) + 1,
      status: 'Draft',
      issuedAt: undefined,
      validUntilOverridden: false,
      acceptance: undefined,
      validUntil: defaultQuotationValidUntil(new Date().toISOString(), company.quotationValidityDays),
    };
    setClientQuotations((current) => [
      revision,
      ...current.map((item) => item.id === quotation.id ? { ...item, status: 'Superseded' as const } : item),
    ]);
    recordQuotationActivity(revision, 'Client quotation revision created', `${revision.reference} version ${revision.version} supersedes version ${quotation.version}.`);
    setEditor(revision);
    setEditorMode('edit');
    setPreserveValidUntil(false);
    setError('');
  };

  const recordQuotationActivity = (quotation: ClientQuotation, title: string, description: string) => {
    const timestamp = new Date().toISOString();
    setActivities((current) => [{
      id: `quotation-activity-${crypto.randomUUID()}`,
      clientId: quotation.clientId,
      leadId: quotation.leadId,
      dealId: quotation.dealId,
      type: 'note',
      title,
      description: `${quotation.reference} v${quotation.version}: ${description}`,
      date: timestamp,
      createdAt: timestamp,
      userId: user.id,
      actorName: user.name,
    }, ...current]);
  };

  const updateEditor = <K extends keyof ClientQuotation>(field: K, value: ClientQuotation[K]) => {
    setEditor((current) => current ? { ...current, [field]: value } : current);
  };

  const createSelectedQuotation = async () => {
    const source = findQuotedSourceLine(quotationRequests, selectedRequestId, selectedLineId);
    if (!source) {
      setError('Select a QRS line with Quoted status before creating a client quotation.');
      return;
    }
    await openDraftFromLine(source.request, source.line);
  };

  const issueQuotation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !canIssue) return;
    setError('');
    const total = quotationTotalSumInsured(editor);
    const now = new Date().toISOString();
    const next = {
      ...editor,
      status: 'Draft' as const,
      validUntil: preserveValidUntil
        ? editor.validUntil
        : defaultQuotationValidUntil(now, company.quotationValidityDays),
      validUntilOverridden: preserveValidUntil,
      totalSumInsured: total,
      ratePct: quotationRatePct(editor.proposedPremium, total),
    };
    const validationErrors = validateClientQuotation(next, company.requireDifferentQuotationAuthorizer);
    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      return;
    }
    const issued = { ...next, status: 'Issued' as const, issuedAt: now };
    setClientQuotations((current) => current.map((item) => item.id === issued.id ? issued : item));
    recordQuotationActivity(issued, 'Client quotation issued', `Valid until ${issued.validUntil}.`);
    setEditor(issued);
    setEditorMode('edit');
    setPreserveValidUntil(true);
    setNotice(`${issued.reference} v${issued.version} issued.`);
  };

  const saveDraft = () => {
    if (!editor || !canIssue || editor.status !== 'Draft') return;
    const total = quotationTotalSumInsured(editor);
    const saved = { ...editor, totalSumInsured: total, ratePct: quotationRatePct(editor.proposedPremium, total) };
    setClientQuotations((current) => current.map((item) => item.id === saved.id ? saved : item));
    setEditor(saved);
    setNotice(`${saved.reference} v${saved.version} draft saved.`);
  };

  const transitionQuotation = async (quotation: ClientQuotation, status: 'Accepted' | 'Rejected' | 'Expired') => {
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
      ...(status === 'Accepted' ? {
        acceptance: {
          name: acceptanceName.trim(),
          designation: acceptanceDesignation.trim(),
          signedAt: now,
        },
      } : {}),
      ...(role === 'client' ? {
        clientResponse: {
          name: acceptanceName.trim() || user.name,
          designation: acceptanceDesignation.trim(),
          respondedAt: now,
          respondedBy: user.id,
        },
      } : {}),
    };
    if (role === 'client' && user.role === 'client' && !AUTH_BYPASS && status !== 'Expired') {
      try {
        const { error: responseError } = await supabase.rpc('accept_client_quotation', {
          p_tenant_id: TENANT_ID,
          p_quotation_id: quotation.id,
          p_status: status,
          p_name: status === 'Accepted' ? acceptanceName.trim() : user.name,
          p_designation: acceptanceDesignation.trim(),
        });
        if (responseError) {
          setError(`Could not record the client response: ${responseError.message}`);
          return;
        }
      } catch (responseError) {
        setError(`Could not record the client response: ${responseError instanceof Error ? responseError.message : String(responseError)}`);
        return;
      }
    }
    setClientQuotations((current) => current.map((item) => item.id === quotation.id ? next : item));
    setEditor((current) => current?.id === quotation.id ? next : current);
    recordQuotationActivity(next, `Client quotation ${status.toLowerCase()}`, status === 'Accepted'
      ? `Accepted by ${acceptanceName.trim()}${acceptanceDesignation.trim() ? `, ${acceptanceDesignation.trim()}` : ''}.`
      : `Status changed to ${status}.`);
    if (status === 'Accepted') advanceDealAfterAcceptance(next);
    setAcceptanceName('');
    setAcceptanceDesignation('');
    setError('');
    setNotice(`${quotation.reference} is ${status.toLowerCase()}.`);
  };

  const advanceDealAfterAcceptance = (quotation: ClientQuotation) => {
    const deal = getDeal(quotation.dealId);
    if (!deal) {
      setError('Quotation accepted, but the linked deal could not be found.');
      return;
    }
    const dealStages = pipelineStages.filter((stage) => stage.pipelineId === deal.pipelineId)
      .sort((left, right) => left.stageOrder - right.stageOrder);
    const currentIndex = dealStages.findIndex((stage) => stage.name === deal.stage);
    const nextStage = currentIndex >= 0 ? dealStages[currentIndex + 1] : undefined;
    if (!nextStage || nextStage.isClosedWon || nextStage.isClosedLost) return;
    const currentStage = dealStages[currentIndex];
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
        details: `Advanced after client accepted ${quotation.reference}.`,
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

  const submitAcceptance = (event: FormEvent<HTMLFormElement>, quotation: ClientQuotation) => {
    event.preventDefault();
    void transitionQuotation(quotation, 'Accepted');
  };

  const editorDeal = editor ? getDeal(editor.dealId) : undefined;
  const editorClient = editor ? getClient(editor.clientId) : undefined;
  const canAccept = role === 'client' || role === 'admin' || role === 'sales';
  const editorErrors = editor ? validateClientQuotation(editor, company.requireDifferentQuotationAuthorizer) : [];

  return (
    <div className="space-y-3">
      {notice && <div role="status" className="rounded-lg border border-win/30 bg-win/10 px-4 py-2 text-sm text-win">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-hot/30 bg-hot/10 px-4 py-2 text-sm text-hot">{error}</div>}
      <PageToolbar name="quotations">
        <h1 className="text-sm font-semibold text-white">Client Quotations</h1>
        {canIssue && <>
          <select className="input !w-auto max-w-64 !py-1.5 text-xs" aria-label="Select quoted QRS line" value={selectedLineId} onChange={(event) => {
            const line = quotedLineOptions.find((entry) => entry.line.id === event.target.value);
            setSelectedLineId(event.target.value);
            setSelectedRequestId(line?.request.id ?? '');
            setError('');
          }}>
            <option value="">Select a Quoted QRS line</option>
            {quotedLineOptions.map(({ request, line }) => <option key={line.id} value={line.id}>
              {line.reference} · {getDeal(request.dealId)?.client ?? 'Deal'} · {line.insurerQuoteRef ?? 'Quoted'}
            </option>)}
          </select>
          <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => void createSelectedQuotation()}>
            <FilePlus2 size={14} /> Create QTY
          </button>
        </>}
      </PageToolbar>

      <section className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-ink-900/60 text-xs text-muted"><tr>
            {['Reference', 'Version', 'Client / risk', 'Insurer line', 'Premium', 'Valid until', 'Status', 'Actions'].map((title) => <th className="px-3 py-3 font-medium" key={title}>{title}</th>)}
          </tr></thead>
          <tbody>
            {visibleQuotations.map((quotation) => {
              const request = quotationRequests.find((item) => item.id === quotation.sourceRequestId);
              const line = request?.lines.find((item) => item.id === quotation.sourceLineId);
              const status = visibleStatus(quotation);
              return <tr key={quotation.id} className="table-row">
                <td className="px-3 py-3 font-medium text-brand-300">{quotation.reference}</td>
                <td className="px-3 py-3">v{quotation.version}</td>
                <td className="px-3 py-3 text-white">{getClient(quotation.clientId)?.name ?? 'Client unavailable'}<div className="text-xs text-muted">{getDeal(quotation.dealId)?.product ?? ''}</div></td>
                <td className="px-3 py-3 font-mono text-xs">{line?.reference ?? 'Source unavailable'}</td>
                <td className="px-3 py-3 text-white">{formatAmount(quotation.proposedPremium, quotation.currency)}</td>
                <td className="px-3 py-3 text-muted">{formatDate(quotation.validUntil)}</td>
                <td className="px-3 py-3"><Badge variant={status === 'Accepted' ? 'win' : status === 'Expired' || status === 'Rejected' ? 'warm' : status === 'Issued' ? 'brand' : 'muted'}>{status}</Badge></td>
                <td className="px-3 py-3">
                  <button type="button" className="text-brand-300 hover:text-white" onClick={() => {
                    setEditor(quotation);
                    setEditorMode('edit');
                    setPreserveValidUntil(quotation.validUntilOverridden ?? quotation.status !== 'Draft');
                    setError('');
                  }}>Open</button>
                </td>
              </tr>;
            })}
            {!visibleQuotations.length && <tr><td colSpan={8} className="p-8 text-center text-muted">No client quotations yet. Create one from a Quoted QRS line.</td></tr>}
          </tbody>
        </table>
      </section>

      {editor && <section className="client-quotation-editor glass rounded-2xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div><h2 className="text-lg font-semibold text-white">{editor.reference} · Version {editor.version}</h2>
            <p className="text-xs text-muted">{editorDeal?.client} · {editorDeal?.product} · {editor.status}{isQuotationExpired(editor) ? ' (expired)' : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canIssue && editor.status === 'Draft' && <button type="submit" form="client-quotation-form" className="btn-primary !py-1.5 text-xs"><Send size={13} /> Issue quotation</button>}
            {canIssue && ['Draft', 'Issued'].includes(editor.status) && <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => reviseQuotation(editor)}><RefreshCw size={13} /> Revise</button>}
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => printDocument('print-client-quotation')}><Printer size={13} /> Print / Save PDF</button>
          </div>
        </div>
        <form id="client-quotation-form" onSubmit={issueQuotation} className="print:hidden grid gap-3 md:grid-cols-2">
          <fieldset disabled={!canIssue} className="contents">
          <Field label="Addressee name *"><input className="input" required value={editor.addressee.name} onChange={(event) => updateEditor('addressee', { ...editor.addressee, name: event.target.value })} /></Field>
          <Field label="Designation"><input className="input" value={editor.addressee.designation} onChange={(event) => updateEditor('addressee', { ...editor.addressee, designation: event.target.value })} /></Field>
          <Field label="Policy number"><input className="input" value={editor.policyNo} onChange={(event) => updateEditor('policyNo', event.target.value)} /></Field>
          <Field label="Endorsement number"><input className="input" value={editor.endorsementNo} onChange={(event) => updateEditor('endorsementNo', event.target.value)} /></Field>
          <Field label="Policy period"><input className="input" value={editor.policyPeriod} onChange={(event) => updateEditor('policyPeriod', event.target.value)} /></Field>
          <Field label="Territorial limits"><input className="input" value={editor.territorialLimits} onChange={(event) => updateEditor('territorialLimits', event.target.value)} /></Field>
          <Field label="Occupation / business"><input className="input" value={editor.occupation} onChange={(event) => updateEditor('occupation', event.target.value)} /></Field>
          <Field label="Risk location"><input className="input" value={editor.riskLocation} onChange={(event) => updateEditor('riskLocation', event.target.value)} /></Field>
          <Field label="Coverage sections (title | interest | sum insured, one row per item)">
            <textarea className="input min-h-24" aria-label="Quotation sections" value={editor.sections.flatMap((section) => section.items.map((item) => `${section.title} | ${item.interest} | ${item.sumInsured}`)).join('\n')}
              onChange={(event) => {
                const sections = new Map<string, Array<{ interest: string; sumInsured: number }>>();
                for (const row of splitRows(event.target.value)) {
                  const [title, interest, amount] = row.split('|');
                  const items = sections.get(title.trim()) ?? [];
                  items.push({ interest: interest?.trim() ?? '', sumInsured: Number(amount?.trim()) || 0 });
                  sections.set(title.trim() || 'Coverage', items);
                }
                updateEditor('sections', [...sections].map(([title, items]) => ({ title, items })));
              }} />
          </Field>
          <Field label="Extensions (name | limit)"><textarea className="input min-h-24" value={editor.extensions.map((item) => `${item.name} | ${item.limit}`).join('\n')}
            onChange={(event) => updateEditor('extensions', splitRows(event.target.value).map((row) => { const [name, ...limit] = row.split('|'); return { name: name.trim(), limit: limit.join('|').trim() }; }))} /></Field>
          <Field label="Covered perils (one per line)"><textarea className="input min-h-24" value={editor.perils.join('\n')} onChange={(event) => updateEditor('perils', splitRows(event.target.value))} /></Field>
          <Field label="Deductibles (label | text)"><textarea className="input min-h-24" value={serializePairs(editor.deductibles)} onChange={(event) => updateEditor('deductibles', parseLabelPairs(event.target.value))} /></Field>
          <Field label="Warranties (title | text)"><textarea className="input min-h-24" value={serializeWarranties(editor.warranties)} onChange={(event) => updateEditor('warranties', parseTitlePairs(event.target.value))} /></Field>
          <Field label="Conditions (one per line)"><textarea className="input min-h-24" value={editor.conditions.join('\n')} onChange={(event) => updateEditor('conditions', splitRows(event.target.value))} /></Field>
          <Field label="Exclusions (one per line)"><textarea className="input min-h-24" value={editor.exclusions.join('\n')} onChange={(event) => updateEditor('exclusions', splitRows(event.target.value))} /></Field>
          <Field label="Disclaimer"><textarea className="input min-h-20" value={editor.disclaimer} onChange={(event) => updateEditor('disclaimer', event.target.value)} /></Field>
          <Field label="Proposed premium *"><input className="input" type="number" min="0.01" step="0.01" required value={editor.proposedPremium} onChange={(event) => updateEditor('proposedPremium', Number(event.target.value))} /></Field>
          <Field label="Currency"><select className="input" value={editor.currency} onChange={(event) => updateEditor('currency', event.target.value as 'MVR' | 'USD')}><option>MVR</option><option>USD</option></select></Field>
          <Field label="Valid until *"><input className="input" type="date" required value={editor.validUntil.slice(0, 10)} onChange={(event) => {
            setPreserveValidUntil(true);
            updateEditor('validUntil', event.target.value);
            updateEditor('validUntilOverridden', true);
          }} /></Field>
          <Field label="Prepared by *"><select className="input" value={editor.preparedBy} onChange={(event) => updateEditor('preparedBy', event.target.value)}>{users.filter((person) => person.role === 'admin' || person.role === 'sales').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
          <Field label="Authorized by *"><select className="input" value={editor.authorizedBy} onChange={(event) => updateEditor('authorizedBy', event.target.value)}><option value="">Select authorizer</option>{users.filter((person) => person.role !== 'client').map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
          <div className="md:col-span-2 text-xs text-muted">Total sum insured: {formatAmount(quotationTotalSumInsured(editor), editor.currency)} · Rate: {quotationRatePct(editor.proposedPremium, quotationTotalSumInsured(editor))}%</div>
          {canIssue && editor.status === 'Draft' && <button type="button" className="btn-ghost w-fit !py-1.5 text-xs" onClick={saveDraft}>Save draft</button>}
          {editorErrors.length > 0 && <p className="md:col-span-2 text-xs text-muted">Issue checks: {editorErrors.join(' ')}</p>}
          {error && <p role="alert" className="md:col-span-2 text-sm text-hot">{error}</p>}
          </fieldset>
        </form>

        <article className="client-quotation-print mt-5 border border-ink-700 bg-white p-5 text-slate-900 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div><h2 className="text-xl font-bold">{company.legalName || company.name || 'Premier Brokers Pvt. Ltd.'}</h2>
              <p>{company.address}</p><p>{company.phone} · {company.email}</p>
            </div>
            <div className="text-right"><h1 className="text-2xl font-bold">QUOTATION</h1><p>{editor.reference}{editor.version > 1 ? `-R${editor.version - 1}` : ''}</p>
              <p>Date: {editor.issuedAt ? formatDate(editor.issuedAt) : formatDate(new Date())}</p><p>Status: {visibleStatus(editor)}</p></div>
          </header>
          <section className="grid gap-3 py-4 sm:grid-cols-2">
            <PrintField label="To" value={editor.addressee.name} /><PrintField label="Designation" value={editor.addressee.designation} />
            <PrintField label="Client" value={editorClient?.name ?? ''} /><PrintField label="Risk / occupation" value={editor.occupation} />
            <PrintField label="Policy / endorsement" value={`${editor.policyNo} / ${editor.endorsementNo}`} />
            <PrintField label="Policy period" value={editor.policyPeriod} /><PrintField label="Territorial limits" value={editor.territorialLimits} /><PrintField label="Risk location" value={editor.riskLocation} />
          </section>
          <table className="w-full border-collapse text-sm"><thead><tr className="border-y border-slate-400"><th className="py-2 text-left">Section / insured interest</th><th className="py-2 text-right">Sum insured</th></tr></thead><tbody>
            {editor.sections.flatMap((section) => section.items.map((item, index) => <tr key={`${section.title}-${item.interest}-${index}`} className="border-b border-slate-200"><td className="py-2">{section.title}: {item.interest}</td><td className="py-2 text-right">{formatAmount(item.sumInsured, editor.currency)}</td></tr>))}
            <tr className="font-bold"><td className="py-2">Total Sum Insured</td><td className="py-2 text-right">{formatAmount(quotationTotalSumInsured(editor), editor.currency)}</td></tr>
          </tbody></table>
          <PrintList title="Coverage / perils" items={editor.perils} />
          <PrintList title="Extensions" items={editor.extensions.map((item) => `${item.name}: ${item.limit}`)} />
          <PrintList title="Deductibles" items={editor.deductibles.map((item) => `${item.label}: ${item.text}`)} />
          <PrintList title="Warranties" items={editor.warranties.map((item) => `${item.title}: ${item.text}`)} />
          <PrintList title="Conditions" items={editor.conditions} />
          <PrintList title="Exclusions" items={editor.exclusions} />
          <div className="mt-4 border-y border-slate-400 py-3 text-right"><strong>Proposed premium: {formatAmount(editor.proposedPremium, editor.currency)}</strong><span className="ml-3">Rate: {quotationRatePct(editor.proposedPremium, quotationTotalSumInsured(editor))}%</span></div>
          <p className="mt-4 text-xs">{editor.disclaimer}</p><p className="mt-2 text-xs">This quotation is valid until {formatDate(editor.validUntil)}.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2"><PrintField label="Prepared by" value={preparedName(editor.preparedBy)} /><PrintField label="Authorized by" value={preparedName(editor.authorizedBy)} /></div>
          <section className="mt-6 border border-slate-400 p-4">
            <h3 className="font-semibold">Client confirmation</h3>
            {editor.acceptance ? <p className="mt-2">Accepted by {editor.acceptance.name}{editor.acceptance.designation ? `, ${editor.acceptance.designation}` : ''} on {formatDate(editor.acceptance.signedAt)}.</p> : <p className="mt-2">I confirm acceptance of the quotation terms above.</p>}
            {!editor.acceptance && canAccept && editor.status === 'Issued' && !isQuotationExpired(editor) && <form className="mt-3 grid gap-2 print:hidden sm:grid-cols-2" onSubmit={(event) => submitAcceptance(event, editor)}>
              <label className="text-xs">Name *<input className="input" required value={acceptanceName} onChange={(event) => setAcceptanceName(event.target.value)} /></label>
              <label className="text-xs">Designation<input className="input" value={acceptanceDesignation} onChange={(event) => setAcceptanceDesignation(event.target.value)} /></label>
              <button type="submit" className="btn-primary !py-1.5 text-xs sm:col-span-2"><Check size={13} /> Accept quotation</button>
            </form>}
            {!editor.acceptance && editor.status === 'Issued' && isQuotationExpired(editor) && <p className="mt-2 text-sm text-amber-700">This quotation has expired and cannot be accepted.</p>}
          </section>
        </article>
        {(canIssue || role === 'client') && editor.status === 'Issued' && <div className="print:hidden flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => void transitionQuotation(editor, 'Rejected')}>Mark rejected</button>
          {isQuotationExpired(editor) && <button type="button" className="btn-ghost text-xs" onClick={() => void transitionQuotation(editor, 'Expired')}>Mark expired</button>}
        </div>}
        {editor.status === 'Accepted' && <p className="mt-2 text-sm text-win">Accepted quotation enables Won; the deal has advanced to its next pipeline stage.</p>}
        {editorMode === 'create' && <span className="sr-only">Created new QTY</span>}
      </section>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs text-muted"><span className="mb-1 block">{label}</span>{children}</label>;
}

function PrintField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="font-medium">{value || '—'}</div></div>;
}

function PrintList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <section className="mt-4"><h3 className="font-semibold">{title}</h3><ul className="mt-1 list-disc pl-5 text-sm">{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></section> : null;
}
