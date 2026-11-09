import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Plus, Search, Send, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import DateInput from '../components/ui/DateInput';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import type { Deal, QuotationRequest } from '../types';
import { formatAmount } from '../utils/currency';
import { formatDate } from '../utils/date';
import { isTerminalDealStage } from '../utils/stageSla';
import { dashboardHref, hashParams } from '../utils/navigation';
import {
  canTransitionQuotationRequestStatus, quotationRequestStatusOptions, type QuotationRequestStatus,
} from '../utils/quotationRequestStatus';

const STATUSES: QuotationRequestStatus[] = ['Draft', 'Sent', 'Responses received', 'Closed'];
const QUOTATION_REQUEST_COLUMNS = [
  'Ref', 'Deal', 'Lead', 'Client', 'Vendors', 'Product',
  'Sum insured + currency', 'Required by', 'Status', 'Actions',
] as const;

function referenceForNextRequest(requests: QuotationRequest[], year: number) {
  const prefix = `QR-${year}-`;
  const nextNumber = requests.reduce((highest, request) => {
    if (!request.ref.startsWith(prefix)) return highest;
    const number = Number(request.ref.slice(prefix.length));
    return Number.isInteger(number) ? Math.max(highest, number) : highest;
  }, 0) + 1;
  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

function resolveDealClient(deal: Deal, clients: ReturnType<typeof useApp>['clients']) {
  return clients.find((client) => client.id === deal.clientId)
    ?? clients.find((client) => client.name.trim().toLowerCase() === deal.client.trim().toLowerCase());
}

function statusTone(status: QuotationRequestStatus): 'muted' | 'brand' | 'warm' | 'win' {
  if (status === 'Draft') return 'muted';
  if (status === 'Sent') return 'brand';
  if (status === 'Responses received') return 'warm';
  return 'win';
}

export default function QSlipsPage() {
  const {
    clients, deals, leads, products, pipelineStages, quotationRequests, setQuotationRequests,
    vendors, user, viewAsRole,
  } = useApp();
  const activeRole = viewAsRole ?? user.role;
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
      if (dealId) {
        openNew(dealId);
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#/qslips`,
        );
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [openNew]);

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId);
  const selectedClient = selectedDeal ? resolveDealClient(selectedDeal, clients) : undefined;
  const linkedLead = selectedDeal
    ? leads.find((lead) => lead.id === selectedDeal.leadId || lead.dealId === selectedDeal.id)
    : undefined;
  const selectedProduct = selectedDeal
    ? products.find((product) => product.code === selectedDeal.productCode)
      ?? products.find((product) => product.name === selectedDeal.product || product.code === selectedDeal.product)
    : undefined;
  const vendorNames = useCallback((vendorIds: string[]) => vendorIds
    .map((vendorId) => vendors.find((vendor) => vendor.id === vendorId)?.name)
    .filter((name): name is string => Boolean(name)), [vendors]);
  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return quotationRequests.filter((request) => {
      const deal = deals.find((item) => item.id === request.dealId);
      const lead = leads.find((item) => item.id === request.leadId);
      const client = clients.find((item) => item.id === request.clientId);
      const product = products.find((item) => item.code === request.productCode);
      const searchable = [
        request.ref, request.dealId, deal?.client, deal?.product, request.leadId,
        lead?.title, lead?.client, client?.name, ...vendorNames(request.vendorIds),
        request.productCode, product?.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return (!requestFilter || request.id === requestFilter)
        && (!statusFilter || request.status === statusFilter)
        && (!vendorFilter || request.vendorIds.includes(vendorFilter))
        && (!clientFilter || request.clientId === clientFilter)
        && searchable.includes(normalizedQuery);
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [clientFilter, clients, deals, leads, products, quotationRequests, requestFilter, searchQuery, statusFilter, vendorFilter, vendorNames]);

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
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
    const year = new Date().getFullYear();
    const request: QuotationRequest = {
      id: `quotation-request-${crypto.randomUUID()}`,
      ref: referenceForNextRequest(quotationRequests, year),
      dealId: selectedDeal.id,
      leadId: linkedLead.id,
      clientId: selectedClient.id,
      vendorIds: selectedVendorIds,
      productCode: selectedDeal.productCode,
      sumInsured: selectedDeal.value,
      currency: selectedDeal.currency,
      requiredBy,
      notes: notes.trim(),
      status: 'Sent',
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    setQuotationRequests((current) => [request, ...current]);
    setOpen(false);
  };

  const updateStatus = (request: QuotationRequest, status: QuotationRequestStatus) => {
    if (!canTransitionQuotationRequestStatus(request.status, status, activeRole)) return;
    const now = new Date().toISOString();
    setQuotationRequests((current) => current.map((item) => item.id === request.id
      ? { ...item, status, updatedBy: user.id, updatedAt: now }
      : item));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">Quotation Request Slips</h2>
          <p className="text-sm text-muted">Track market requests linked to open deals.</p>
        </div>
        <button className="btn-primary !py-1.5" onClick={() => openNew()}><Plus size={14} /> New QRS</button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SlipCount label="Draft" value={quotationRequests.filter((request) => request.status === 'Draft').length} color="text-warm" />
        <SlipCount label="Awaiting Insurer" value={quotationRequests.filter((request) => request.status === 'Sent').length} color="text-cold" />
        <SlipCount label="Responses Received" value={quotationRequests.filter((request) => request.status === 'Responses received').length} color="text-win" />
      </div>

      <section className="glass space-y-3 rounded-2xl p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Search">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
              <input className="input !pl-9" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Reference, deal, lead, client, vendor" aria-label="Search quotation requests" />
            </div>
          </FilterField>
          <FilterField label="Status">
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </FilterField>
          <FilterField label="Vendor">
            <select className="input" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}>
              <option value="">All vendors</option>
              {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Client">
            <select className="input" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="">All clients</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </FilterField>
        </div>
        {requestFilter && (
          <button type="button" className="text-xs text-brand-300 hover:text-white" onClick={() => {
            setRequestFilter('');
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/qslips`);
          }}>Clear linked-request filter</button>
        )}
      </section>

      <div className="glass min-w-0 overflow-hidden rounded-2xl">
        <div className="fit-wrap qrs-list-fit w-full max-w-full min-w-0">
          <table className="table-fixed w-full text-left text-sm">
            <colgroup>{QUOTATION_REQUEST_COLUMNS.map((column) => <col key={column} />)}</colgroup>
            <thead className="bg-ink-900/60 text-[11px] tracking-wider text-muted">
              <tr>
                {QUOTATION_REQUEST_COLUMNS.map((label) => (
                  <th key={label} scope="col" className="px-3 py-3 text-left font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => {
                const deal = deals.find((item) => item.id === request.dealId);
                const client = clients.find((item) => item.id === request.clientId);
                const lead = leads.find((item) => item.id === request.leadId);
                const product = products.find((item) => item.code === request.productCode);
                return (
                  <tr key={request.id} className="table-row">
                    <td data-label={QUOTATION_REQUEST_COLUMNS[0]} className="font-medium text-brand-300">{request.ref}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[1]}><div className="font-mono text-xs text-muted">{deal?.id ?? request.dealId}</div><div className="text-white">{deal?.product ?? 'Deal unavailable'}</div></td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[2]}><div className="font-mono text-xs">{lead?.id ?? request.leadId}</div><div className="text-muted">{lead?.title ?? lead?.client ?? 'Lead unavailable'}</div></td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[3]} className="text-white">{client?.name ?? 'Client unavailable'}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[4]} className="text-muted">{vendorNames(request.vendorIds).join(', ') || 'No vendors'}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[5]} className="text-white">{product?.name ?? request.productCode}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[6]} className="font-medium text-white">{formatAmount(request.sumInsured, request.currency)}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[7]} className="text-muted">{formatDate(request.requiredBy)}</td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[8]}>
                      {activeRole === 'admin' || activeRole === 'sales' ? (
                        <select
                          aria-label={`Status for ${request.ref}`}
                          className="input qrs-status-select !py-1 text-xs"
                          value={request.status}
                          onChange={(event) => updateStatus(request, event.target.value as QuotationRequestStatus)}
                        >
                          {quotationRequestStatusOptions(request.status, activeRole).map(({ status, label, disabled }) => (
                            <option key={status} value={status} disabled={disabled}>{label}</option>
                          ))}
                        </select>
                      ) : <Badge variant={statusTone(request.status)}>{request.status}</Badge>}
                    </td>
                    <td data-label={QUOTATION_REQUEST_COLUMNS[9]} className="text-right">
                      <a className="inline-flex items-center gap-1 text-xs text-brand-300 hover:text-white" href={dashboardHref('deals', { id: request.dealId })}>
                        Deal <ArrowUpRight size={13} />
                      </a>
                    </td>
                  </tr>
                );
              })}
              {filteredRequests.length === 0 && (
                <tr className="qrs-list-empty"><td data-label={QUOTATION_REQUEST_COLUMNS[0]} colSpan={QUOTATION_REQUEST_COLUMNS.length} className="px-4 py-10 text-center text-sm text-muted">
                  {quotationRequests.length ? 'No quotation requests match these filters.' : 'No quotation requests yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Quotation Request"
        subtitle="Select an open deal, then choose the markets to approach."
        size="lg"
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
          <button type="submit" form="quotation-request-form" className="btn-primary"><Send size={14} /> Submit to Insurer</button>
        </>}
      >
        <form id="quotation-request-form" onSubmit={submitRequest} className="space-y-4">
          <FilterField label="Deal *">
            <select
              className="input"
              required
              value={selectedDealId}
              onChange={(event) => { setSelectedDealId(event.target.value); setFormError(''); }}
            >
              <option value="">Select an open deal</option>
              {openDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.client} · {deal.product}</option>)}
            </select>
          </FilterField>

          {selectedDeal && (
            <section className="grid grid-cols-1 gap-3 rounded-xl border border-ink-600 bg-ink-900/40 p-3 sm:grid-cols-2">
              <ReadOnlyField label="Client" value={selectedClient?.name ?? selectedDeal.client} />
              <ReadOnlyField label="Lead" value={linkedLead?.title ?? linkedLead?.client ?? 'No linked lead'} />
              <ReadOnlyField label="Product" value={selectedProduct ? `${selectedProduct.code} · ${selectedProduct.name}` : selectedDeal.productCode ?? selectedDeal.product} />
              <ReadOnlyField label="Sum Insured" value={formatAmount(selectedDeal.value, selectedDeal.currency)} />
            </section>
          )}

          <FilterField label="Required By *">
            <DateInput required value={requiredBy} onIsoChange={setRequiredBy} aria-label="Required by date" />
          </FilterField>

          <fieldset>
            <legend className="mb-2 text-xs text-muted">Insurers / Reinsurers *</legend>
            {insurerOptions.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {insurerOptions.map((vendor) => (
                  <label key={vendor.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/40 px-3 py-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={selectedVendorIds.includes(vendor.id)}
                      onChange={() => setSelectedVendorIds((current) => current.includes(vendor.id)
                        ? current.filter((id) => id !== vendor.id)
                        : [...current, vendor.id])}
                    />
                    <span>{vendor.name}</span>
                    <span className="ml-auto text-[10px] text-muted">{vendor.vendorType}</span>
                  </label>
                ))}
              </div>
            ) : <p className="text-sm text-muted">Add an active insurer or reinsurer before submitting a request.</p>}
          </fieldset>

          <FilterField label="Notes">
            <textarea className="input min-h-20" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FilterField>
          {formError && <p role="alert" className="text-sm text-hot">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}

function SlipCount({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="glass rounded-2xl p-4"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div></div>;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 text-sm text-white">{value}</div></div>;
}
