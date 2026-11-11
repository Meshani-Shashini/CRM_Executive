import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, Plus, Search, Send, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import DateInput from '../components/ui/DateInput';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import type { Deal, QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus } from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import { isTerminalDealStage } from '../utils/stageSla';
import { dashboardHref, hashParams } from '../utils/navigation';
import {
  canTransitionQuotationRequestStatus, quotationRequestStatusOptions,
} from '../utils/quotationRequestStatus';
import {
  deriveRequestStatus, hasDuplicateQuotationReferences, nextLineReference,
} from '../utils/quotationRequests';
import { getNextReference } from '../utils/references';

const STATUSES: QuotationRequestLineStatus[] = ['Requested', 'Sent', 'Quoted', 'Declined', 'Expired', 'Cancelled'];

function resolveDealClient(deal: Deal, clients: ReturnType<typeof useApp>['clients']) {
  return clients.find((client) => client.id === deal.clientId)
    ?? clients.find((client) => client.name.trim().toLowerCase() === deal.client.trim().toLowerCase());
}

function statusTone(status: ReturnType<typeof deriveRequestStatus>): 'muted' | 'brand' | 'warm' | 'win' {
  if (status === 'Quoted') return 'win';
  if (status === 'Partially Quoted' || status === 'Declined') return 'warm';
  if (status === 'Sent') return 'brand';
  return 'muted';
}

export default function QSlipsPage() {
  const {
    clients, deals, leads, pipelineStages, quotationRequests, setQuotationRequests,
    vendors, user, viewAsRole, setActivities,
  } = useApp();
  const activeRole = viewAsRole ?? user.role;
  const canEdit = activeRole === 'admin' || activeRole === 'sales';
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
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [requiredBy, setRequiredBy] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [requestFilter, setRequestFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRequests, setExpandedRequests] = useState<string[]>([]);
  const [editingLine, setEditingLine] = useState<{ requestId: string; lineId: string } | null>(null);
  const [lineStatus, setLineStatus] = useState<QuotationRequestLineStatus>('Sent');
  const [linePremium, setLinePremium] = useState('');
  const [lineCurrency, setLineCurrency] = useState<'MVR' | 'USD'>('MVR');
  const [lineRate, setLineRate] = useState('');
  const [lineValidity, setLineValidity] = useState('');
  const [lineQuoteReference, setLineQuoteReference] = useState('');
  const [lineDeductibles, setLineDeductibles] = useState('');
  const [lineWarranties, setLineWarranties] = useState('');
  const [lineRemarks, setLineRemarks] = useState('');
  const [lineError, setLineError] = useState('');
  const [addVendorRequestId, setAddVendorRequestId] = useState('');
  const [addVendorId, setAddVendorId] = useState('');

  const openNew = useCallback((dealId = '') => {
    setSelectedDealId(dealId);
    setSelectedVendorIds([]);
    setRequiredBy('');
    setNotes('');
    setFormError('');
    setOpen(true);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const params = hashParams();
      setRequestFilter(params.get('requestId') ?? '');
      const dealId = params.get('dealId');
      if (dealId && canEdit) {
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
  const vendorName = useCallback((vendorId: string) =>
    vendors.find((vendor) => vendor.id === vendorId)?.name ?? 'Unknown insurer', [vendors]);
  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return quotationRequests.flatMap((request) => {
      const deal = deals.find((item) => item.id === request.dealId);
      const lead = leads.find((item) => item.id === request.leadId);
      const client = clients.find((item) => item.id === request.clientId);
      const requestMatchesSearch = [
        request.reference, request.dealId, deal?.client, deal?.product, request.leadId,
        lead?.title, lead?.client, client?.name,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
      const lines = request.lines.filter((line) => {
        const lineMatchesSearch = [
          line.reference, line.insurerQuoteRef, vendorName(line.vendorId),
        ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
        return (!statusFilter || line.status === statusFilter)
          && (!vendorFilter || line.vendorId === vendorFilter)
          && (!clientFilter || request.clientId === clientFilter)
          && (!normalizedQuery || requestMatchesSearch || lineMatchesSearch);
      });
      if ((!requestFilter || request.id === requestFilter) && lines.length) return [{ request, lines }];
      return [];
    }).sort((left, right) => right.request.createdAt.localeCompare(left.request.createdAt));
  }, [clientFilter, clients, deals, leads, quotationRequests, requestFilter, searchQuery, statusFilter, vendorFilter, vendorName]);

  const addActivity = (request: QuotationRequest, line: QuotationRequestLine, title: string, description: string) => {
    const now = new Date().toISOString();
    setActivities((current) => [{
      id: `qrs-line-${crypto.randomUUID()}`,
      clientId: '',
      leadId: request.leadId,
      dealId: request.dealId,
      insurer: vendorName(line.vendorId),
      type: 'note',
      title,
      description: `${line.reference} · ${vendorName(line.vendorId)}: ${description}`,
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    }, ...current]);
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
    if (!linkedLead) {
      setFormError('The selected deal has no linked lead. Link the deal to a lead before submitting a quotation request.');
      return;
    }
    if (!selectedClient) {
      setFormError('The selected deal must be linked to a client before submitting a quotation request.');
      return;
    }
    if (!selectedDeal.productCode || !Number.isFinite(selectedDeal.value) || selectedDeal.value <= 0) {
      setFormError('The selected deal must have a product and a positive insured value.');
      return;
    }
    if (!selectedVendorIds.length) {
      setFormError('Select at least one active insurer or reinsurer.');
      return;
    }
    if (!requiredBy) {
      setFormError('Choose the date by which the quotation is required.');
      return;
    }

    const now = new Date().toISOString();
    let reference: string;
    try {
      reference = await getNextReference('quotation-request', new Date().getFullYear(), quotationRequests.map((request) => request.reference));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not allocate a quotation request reference.');
      return;
    }
    const id = `quotation-request-${crypto.randomUUID()}`;
    const request: QuotationRequest = {
      id,
      reference,
      dealId: selectedDeal.id,
      leadId: linkedLead.id,
      clientId: selectedClient.id,
      requiredBy,
      insuredAmount: selectedDeal.value,
      currency: selectedDeal.currency,
      notes: notes.trim(),
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
      lines: selectedVendorIds.map((vendorId, index) => ({
        id: `${id}-line-${index + 1}`,
        reference: `${reference}-${String(index + 1).padStart(2, '0')}`,
        vendorId,
        status: 'Sent',
        sentAt: now,
        remarks: '',
        statusHistory: [{ toStatus: 'Sent', changedAt: now, changedBy: user.id }],
      })),
    };
    if (hasDuplicateQuotationReferences([...quotationRequests, request])) {
      setFormError('This quotation batch would duplicate an existing batch or line reference.');
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
    setLinePremium(line.quotedPremium === undefined ? '' : String(line.quotedPremium));
    setLineCurrency(line.quotedCurrency ?? request.currency);
    setLineRate(line.quotedRatePct === undefined ? '' : String(line.quotedRatePct));
    setLineValidity(line.validUntil ?? '');
    setLineQuoteReference(line.insurerQuoteRef ?? '');
    setLineDeductibles((line.insurerDeductibles ?? []).join('\n'));
    setLineWarranties((line.insurerWarranties ?? []).map((item) => `${item.title} | ${item.text}`).join('\n'));
    setLineRemarks(line.remarks);
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
    if (!canTransitionQuotationRequestStatus(line.status, lineStatus, activeRole)) {
      setLineError('You are not allowed to make this line status transition.');
      return;
    }
    const premium = linePremium === '' ? undefined : Number(linePremium);
    const rate = lineRate === '' ? undefined : Number(lineRate);
    if (lineStatus === 'Quoted' && (!Number.isFinite(premium) || (premium ?? 0) <= 0)) {
      setLineError('Enter a positive quoted premium before marking this line Quoted.');
      return;
    }
    if (lineStatus === 'Declined' && !lineRemarks.trim()) {
      setLineError('Enter the insurer decline reason before marking this line Declined.');
      return;
    }
    if (lineRate !== '' && (!Number.isFinite(rate) || (rate ?? -1) < 0)) {
      setLineError('Enter a valid quoted rate percentage.');
      return;
    }
    const now = new Date().toISOString();
    const updatedLine: QuotationRequestLine = {
      ...line,
      status: lineStatus,
      ...(lineStatus === 'Sent' ? { sentAt: line.sentAt ?? now } : {}),
      ...(lineStatus === 'Quoted' || lineStatus === 'Declined' ? { respondedAt: now } : {}),
      ...(premium === undefined ? {} : { quotedPremium: premium }),
      ...(lineStatus === 'Quoted' ? { quotedCurrency: lineCurrency } : {}),
      ...(rate === undefined ? {} : { quotedRatePct: rate }),
      ...(lineValidity ? { validUntil: lineValidity } : {}),
      ...(lineQuoteReference.trim() ? { insurerQuoteRef: lineQuoteReference.trim() } : {}),
      ...(lineStatus === 'Quoted' ? {
        insurerDeductibles: lineDeductibles.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
        insurerWarranties: lineWarranties.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
          const [title, ...text] = entry.split('|');
          return { title: title.trim(), text: text.join('|').trim() };
        }),
      } : {}),
      remarks: lineRemarks.trim(),
      statusHistory: [...line.statusHistory, {
        fromStatus: line.status,
        toStatus: lineStatus,
        changedAt: now,
        changedBy: user.id,
        ...(lineStatus === 'Declined' ? { reason: lineRemarks.trim() } : {}),
      }],
    };
    const updatedRequest: QuotationRequest = {
      ...request,
      updatedAt: now,
      lines: request.lines.map((item) => item.id === line.id ? updatedLine : item),
    };
    if (hasDuplicateQuotationReferences(quotationRequests.map((item) =>
      item.id === request.id ? updatedRequest : item))) {
      setLineError('This update would duplicate an existing quotation reference.');
      return;
    }
    setQuotationRequests((current) => current.map((item) => item.id === request.id ? updatedRequest : item));
    addActivity(request, updatedLine, 'Quotation request line status changed', `${line.status} → ${lineStatus}${lineStatus === 'Declined' ? ` · ${lineRemarks.trim()}` : ''}`);
    setEditingLine(null);
  };

  const addInsurerLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request = quotationRequests.find((item) => item.id === addVendorRequestId);
    if (!request || !addVendorId) return;
    if (request.lines.some((line) => line.vendorId === addVendorId && line.status !== 'Cancelled')) {
      setLineError('This insurer already has an active line in the batch.');
      return;
    }
    const now = new Date().toISOString();
    const line: QuotationRequestLine = {
      id: `${request.id}-line-${crypto.randomUUID()}`,
      reference: nextLineReference(request),
      vendorId: addVendorId,
      status: 'Requested',
      remarks: '',
      statusHistory: [{ toStatus: 'Requested', changedAt: now, changedBy: user.id }],
    };
    const updatedRequest = { ...request, updatedAt: now, lines: [...request.lines, line] };
    if (hasDuplicateQuotationReferences(quotationRequests.map((item) =>
      item.id === request.id ? updatedRequest : item))) {
      setLineError('This insurer line would duplicate an existing quotation reference.');
      return;
    }
    setQuotationRequests((current) => current.map((item) => item.id === request.id ? updatedRequest : item));
    addActivity(updatedRequest, line, 'Quotation request line created', 'Insurer added to the batch.');
    setAddVendorRequestId('');
    setAddVendorId('');
  };

  const toggleExpanded = (requestId: string) => setExpandedRequests((current) =>
    current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId]);

  const visibleLine = editingLine
    ? quotationRequests.find((request) => request.id === editingLine.requestId)?.lines
      .find((line) => line.id === editingLine.lineId)
    : undefined;
  const availableVendors = addVendorRequestId
    ? insurerOptions.filter((vendor) => !quotationRequests.find((item) => item.id === addVendorRequestId)
      ?.lines.some((line) => line.vendorId === vendor.id && line.status !== 'Cancelled'))
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <PageToolbar name="qslips">
        <Badge compact variant="warm">Requested <span className="font-semibold">{quotationRequests.flatMap((request) => request.lines).filter((line) => line.status === 'Requested').length}</span></Badge>
        <Badge compact variant="cold">Sent <span className="font-semibold">{quotationRequests.flatMap((request) => request.lines).filter((line) => line.status === 'Sent').length}</span></Badge>
        <Badge compact variant="win">Quoted <span className="font-semibold">{quotationRequests.flatMap((request) => request.lines).filter((line) => line.status === 'Quoted').length}</span></Badge>
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
        {requestFilter && <button type="button" className="btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => {
          setRequestFilter('');
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/qslips`);
        }}>Clear linked-request filter</button>}
        {canEdit && <button className="btn-primary !px-2 !py-1.5 !text-xs" onClick={() => openNew()}><Plus size={14} /> New QRS</button>}
      </PageToolbar>

      <div data-page-content="qslips" className="glass min-w-0 overflow-hidden rounded-2xl">
        <div className="fit-wrap qrs-list-fit w-full max-w-full min-w-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-900/60 text-[11px] tracking-wider text-muted">
              <tr>
                {['Batch / Deal', 'Lead', 'Client', 'Batch status', 'Required by', 'Insured amount', 'Actions'].map((label) => (
                  <th key={label} scope="col" className="px-3 py-3 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(({ request, lines }) => {
                const deal = deals.find((item) => item.id === request.dealId);
                const client = clients.find((item) => item.id === request.clientId);
                const lead = leads.find((item) => item.id === request.leadId);
                const status = deriveRequestStatus(request.lines);
                const expanded = expandedRequests.includes(request.id);
                return (
                  <Fragment key={request.id}>
                    <tr className="table-row">
                      <td className="px-3 py-3">
                        <button type="button" className="mr-2 align-middle text-muted" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${request.reference}`} onClick={() => toggleExpanded(request.id)}>
                          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <span className="font-medium text-brand-300">{request.reference}</span>
                        <div className="ml-6 font-mono text-[10px] text-muted">{deal?.id ?? request.dealId} · {deal?.product ?? 'Deal unavailable'}</div>
                      </td>
                      <td className="px-3 py-3"><div className="font-mono text-xs">{lead?.id ?? request.leadId}</div><div className="text-muted">{lead?.title ?? lead?.client ?? 'Lead unavailable'}</div></td>
                      <td className="px-3 py-3 text-white">{client?.name ?? 'Client unavailable'}</td>
                      <td className="px-3 py-3"><Badge variant={statusTone(status)}>{status}</Badge><div className="text-[10px] text-muted">{lines.length} matching line{lines.length === 1 ? '' : 's'}</div></td>
                      <td className="px-3 py-3 text-muted">{formatDate(request.requiredBy)}</td>
                      <td className="px-3 py-3 font-medium text-white">{formatAmount(request.insuredAmount, request.currency)}</td>
                      <td className="px-3 py-3 text-right">
                        <a className="inline-flex items-center gap-1 text-xs text-brand-300 hover:text-white" href={dashboardHref('deals', { id: request.dealId })}>Deal <ArrowUpRight size={13} /></a>
                        {canEdit && <button type="button" className="ml-2 text-xs text-brand-300" onClick={() => { setAddVendorRequestId(request.id); setAddVendorId(''); setLineError(''); }}>Add insurer</button>}
                      </td>
                    </tr>
                    {expanded && lines.map((line) => (
                      <tr key={line.id} className="border-t border-ink-700/60 bg-ink-900/30 text-xs">
                        <td className="py-2 pl-10 font-mono text-brand-300">{line.reference}</td>
                        <td className="py-2 text-white">{vendorName(line.vendorId)}{line.insurerQuoteRef ? <div className="text-[10px] text-muted">Insurer ref: {line.insurerQuoteRef}</div> : null}</td>
                        <td className="py-2 text-muted">{line.statusHistory[line.statusHistory.length - 1]?.reason || line.remarks || '—'}</td>
                        <td className="py-2"><Badge variant={statusTone(line.status)} compact>{line.status}</Badge></td>
                        <td className="py-2 text-muted">{formatDate(request.requiredBy)}{line.validUntil ? <div className="text-[10px]">Valid to {formatDate(line.validUntil)}</div> : null}</td>
                        <td className="py-2 font-medium text-white">{line.quotedPremium === undefined ? '—' : formatAmount(line.quotedPremium, line.quotedCurrency ?? request.currency)}{line.quotedRatePct === undefined ? null : <div className="text-[10px] text-muted">{line.quotedRatePct}% rate</div>}</td>
                        <td className="py-2 text-right">
                          {canEdit && <button type="button" className="btn-ghost !px-2 !py-1 text-xs" aria-label={`Update ${line.reference}`} onClick={() => openLineEditor(request, line)}>Update line</button>}
                        </td>
                      </tr>
                    ))}
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

      <Modal open={open} onClose={() => setOpen(false)} title="New Quotation Request" subtitle="Select an open deal, then choose the markets to approach." size="lg" footer={<>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
        <button type="submit" form="quotation-request-form" className="btn-primary"><Send size={14} /> Submit to Insurers</button>
      </>}>
        <form id="quotation-request-form" onSubmit={submitRequest} className="space-y-4">
          <FilterField label="Deal *">
            <select className="input" required value={selectedDealId} onChange={(event) => { setSelectedDealId(event.target.value); setFormError(''); }}>
              <option value="">Select an open deal</option>
              {openDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.client} · {deal.product}</option>)}
            </select>
          </FilterField>
          {selectedDeal && <section className="grid grid-cols-1 gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-3 sm:grid-cols-2">
            <ReadOnlyField label="Client" value={selectedClient?.name ?? selectedDeal.client} />
            <ReadOnlyField label="Lead" value={linkedLead?.title ?? linkedLead?.client ?? 'No linked lead'} />
            <ReadOnlyField label="Product" value={selectedDeal.productCode ?? selectedDeal.product} />
            <ReadOnlyField label="Insured amount" value={formatAmount(selectedDeal.value, selectedDeal.currency)} />
          </section>}
          <FilterField label="Required By *"><DateInput required value={requiredBy} onIsoChange={setRequiredBy} aria-label="Required by date" /></FilterField>
          <fieldset>
            <legend className="mb-2 text-xs text-muted">Insurers / Reinsurers *</legend>
            {insurerOptions.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {insurerOptions.map((vendor) => <label key={vendor.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/40 px-3 py-2 text-sm text-white">
                <input type="checkbox" checked={selectedVendorIds.includes(vendor.id)} onChange={() => setSelectedVendorIds((current) => current.includes(vendor.id)
                  ? current.filter((id) => id !== vendor.id) : [...current, vendor.id])} />
                <span>{vendor.name}</span><span className="ml-auto text-[10px] text-muted">{vendor.vendorType}</span>
              </label>)}
            </div> : <p className="text-sm text-muted">Add an active insurer or reinsurer before submitting a request.</p>}
          </fieldset>
          <FilterField label="Notes"><textarea className="input min-h-20" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></FilterField>
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
              {quotationRequestStatusOptions(visibleLine.status, activeRole).map(({ status, label, disabled }) => <option key={status} value={status} disabled={disabled}>{label}</option>)}
            </select>
          </FilterField>
          {lineStatus === 'Quoted' && <>
            <FilterField label="Quoted premium *"><input className="input" type="number" min="0.01" step="0.01" required value={linePremium} onChange={(event) => setLinePremium(event.target.value)} /></FilterField>
            <FilterField label="Quoted currency *"><select className="input" value={lineCurrency} onChange={(event) => setLineCurrency(event.target.value as 'MVR' | 'USD')}><option value="MVR">MVR</option><option value="USD">USD</option></select></FilterField>
            <FilterField label="Quoted rate %"><input className="input" type="number" min="0" step="0.01" value={lineRate} onChange={(event) => setLineRate(event.target.value)} /></FilterField>
            <FilterField label="Valid until"><DateInput value={lineValidity} onIsoChange={setLineValidity} aria-label="Quote valid until" /></FilterField>
            <FilterField label="Insurer quote reference"><input className="input" value={lineQuoteReference} onChange={(event) => setLineQuoteReference(event.target.value)} /></FilterField>
            <FilterField label="Insurer deductibles (one per line)"><textarea className="input min-h-16" value={lineDeductibles} onChange={(event) => setLineDeductibles(event.target.value)} /></FilterField>
            <FilterField label="Insurer warranties (title | text)"><textarea className="input min-h-16" value={lineWarranties} onChange={(event) => setLineWarranties(event.target.value)} /></FilterField>
          </>}
          {(lineStatus === 'Declined' || visibleLine.remarks) && <FilterField label={lineStatus === 'Declined' ? 'Decline reason *' : 'Remarks'}>
            <textarea className="input min-h-20" required={lineStatus === 'Declined'} value={lineRemarks} onChange={(event) => setLineRemarks(event.target.value)} />
          </FilterField>}
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
