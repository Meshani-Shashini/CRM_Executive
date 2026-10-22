import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Columns3, Filter, List, Plus, X, Pencil } from 'lucide-react';
import type { Client, Lead, LeadFunnelStage } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';
import { hashParams } from '../utils/navigation';
import { formatDate, normalizeDateInput } from '../utils/date';
import DateInput from '../components/ui/DateInput';
import ProductSelect from '../components/ui/ProductSelect';
import { calculateBrokerageCommission } from '../utils/insurance';

const PRE_PIPELINE_STAGES: LeadFunnelStage[] = [
  'L0: Capture',
  'L1: KYC/AML Triage',
  'L2: LOB Scoping',
  'L3: Qualified Opportunity',
];

export default function LeadsPage() {
  const {
    leads, setLeads, clients, setClients, user, users, pipelines, pipelineStages,
    customerLookups, setCustomerLookups, products,
  } = useApp();
  const PRODUCT_CODES = products;
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [personName, setPersonName] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [productCode, setProductCode] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [leadFunnelStage, setLeadFunnelStage] = useState<LeadFunnelStage>('L0: Capture');
  const [leadCurrency, setLeadCurrency] = useState<Currency | ''>('');
  const [leadValue, setLeadValue] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [formError, setFormError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState(() => hashParams().get('temperature') ?? '');
  const [stageFilter, setStageFilter] = useState(() => hashParams().get('stage') ?? '');
  const [ownerFilter, setOwnerFilter] = useState(() => hashParams().get('owner') ?? '');
  const [leadIdFilter, setLeadIdFilter] = useState(() => hashParams().get('id') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => hashParams().get('status') ?? '');
  const [insuranceClassFilter, setInsuranceClassFilter] = useState(() => hashParams().get('insuranceClass') ?? '');
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const selectedPipeline = activePipelines.find((pipeline) => pipeline.id === selectedPipelineId);
  const stages = useMemo(() => pipelineStages
    .filter((stage) => stage.pipelineId === selectedPipelineId)
    .sort((left, right) => left.stageOrder - right.stageOrder), [pipelineStages, selectedPipelineId]);
  const selectedOrganization = clients.find(
    (client) => client.name.trim().toLowerCase() === organizationQuery.trim().toLowerCase(),
  );
  const staffOptions = useMemo(() => {
    const staff = users.filter((candidate) => candidate.role === 'admin' || candidate.role === 'sales');
    if ((user.role === 'admin' || user.role === 'sales') && !staff.some((candidate) => candidate.id === user.id)) {
      return [...staff, user];
    }
    return staff;
  }, [user, users]);
  const personOptions = useMemo(() => [...new Set([
    ...users.filter((candidate) => candidate.role === 'sales').map((candidate) => candidate.name),
    ...customerLookups.salesPersons,
  ])], [customerLookups.salesPersons, users]);
  const boardPipeline = selectedPipeline ?? activePipelines[0];
  const boardStages = pipelineStages
    .filter((stage) => stage.pipelineId === boardPipeline?.id)
    .sort((left, right) => left.stageOrder - right.stageOrder);
  useEffect(() => {
    const product = products.find((item) => item.code === productCode);
    const routedPipeline = activePipelines.find((pipeline) => pipeline.code === product?.defaultPipelineCode);
    if (routedPipeline && (!selectedPipelineId || selectedPipelineId !== routedPipeline.id)) {
      setSelectedPipelineId(routedPipeline.id);
    }
  }, [activePipelines, productCode, products, selectedPipelineId]);
  useEffect(() => {
    const firstStage = stages[0];
    if (!firstStage) {
      setSelectedStageId('');
    } else if (!stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(firstStage.id);
    }
  }, [selectedStageId, stages]);
  useEffect(() => {
    const applyHashFilters = () => {
      const params = hashParams();
      setTemperatureFilter(params.get('temperature') ?? '');
      setStageFilter(params.get('stage') ?? '');
      setOwnerFilter(params.get('owner') ?? '');
      setLeadIdFilter(params.get('id') ?? '');
      setStatusFilter(params.get('status') ?? '');
      setInsuranceClassFilter(params.get('insuranceClass') ?? '');
    };
    window.addEventListener('hashchange', applyHashFilters);
    return () => window.removeEventListener('hashchange', applyHashFilters);
  }, []);
  const matchesLeadFilters = (lead: Lead) =>
    (user.role === 'admin' || (user.role === 'sales' && lead.ownerId === user.id)) &&
    (!temperatureFilter || lead.temperature === temperatureFilter) &&
    (!stageFilter || lead.funnelStage === stageFilter) &&
    (!ownerFilter || lead.ownerId === ownerFilter) &&
    (!leadIdFilter || lead.id === leadIdFilter) &&
    (!insuranceClassFilter || lead.insuranceClass === insuranceClassFilter) &&
    (!statusFilter || (statusFilter === 'active' ? lead.status !== 'COMPLETED' : lead.status === statusFilter));
  const visibleLeads = leads.filter((lead) =>
    matchesLeadFilters(lead) &&
    (!boardPipeline || lead.pipelineId === boardPipeline.id ||
      (!lead.pipelineId && !lead.leadFunnelStage && boardPipeline.id === activePipelines[0]?.id))
  );
  const prePipelineLeads = leads.filter((lead) => matchesLeadFilters(lead) && !lead.pipelineId && Boolean(lead.leadFunnelStage));

  const resetLeadForm = () => {
    setEditingLead(null);
    setOrganizationQuery('');
    setPersonName('');
    setLeadTitle('');
    setProductCode('');
    setCloseDate('');
    setOwnerId('');
    setLeadFunnelStage('L0: Capture');
    setLeadCurrency('');
    setLeadValue('');
    setExchangeRate('');
    setFormError('');
    setSelectedPipelineId('');
    setSelectedStageId('');
    setNewOrganizationOpen(false);
  };

  const openLeadForm = () => {
    resetLeadForm();
    setNewLeadOpen(true);
  };

  const openEditLead = (lead: Lead) => {
    if (user.role !== 'admin' && user.role !== 'sales') return;
    setFormError('');
    setEditingLead(lead);
    setOrganizationQuery(lead.client);
    setPersonName(lead.person ?? lead.contact);
    setLeadTitle(lead.title ?? `${lead.client} lead`);
    setProductCode(lead.productCode);
    setCloseDate(lead.closeDate ?? lead.renewalDate);
    setOwnerId(lead.ownerId);
    setLeadFunnelStage(lead.leadFunnelStage ?? (lead.pipelineId ? 'L3: Qualified Opportunity' : 'L0: Capture'));
    setSelectedPipelineId(lead.pipelineId ?? activePipelines[0]?.id ?? '');
    setLeadCurrency(lead.currency ?? 'MVR');
    setLeadValue(String(lead.value ?? lead.premium));
    setExchangeRate(lead.currency === 'USD' ? String(lead.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE) : '');
    setNewLeadOpen(true);
  };

  const createOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    const existing = clients.find((client) => client.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setOrganizationQuery(existing.name);
      setNewOrganizationOpen(false);
      return;
    }

    const organization: Client = {
      id: `org-${crypto.randomUUID()}`,
      name,
      tin: '',
      country: '',
      phone: '',
      email: '',
      address: '',
      sumInsured: 0,
      premium: 0,
      expiry: '',
      insurer: '',
      productCode: '',
      class: '',
      ownerId: user.id,
      tags: [],
    };
    setClients((current) => [organization, ...current]);
    setOrganizationQuery(name);
    setNewOrganizationOpen(false);
  };

  const createLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user.role !== 'admin' && user.role !== 'sales') return;
    const data = new FormData(event.currentTarget);
    const title = leadTitle.trim();
    const product = products.find((item) => item.code === productCode);
    const selectedPersonName = personName.trim();
    const person = users.find((candidate) =>
      candidate.role === 'sales' && candidate.name.trim().toLowerCase() === selectedPersonName.toLowerCase(),
    );
    const owner = user.role === 'sales'
      ? user
      : staffOptions.find((candidate) => candidate.id === ownerId);
    const amount = Number(data.get('value'));
    const rate = leadCurrency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? stages[0];
    const isQualified = leadFunnelStage === 'L3: Qualified Opportunity';
    const expectedCloseDate = normalizeDateInput(closeDate);

    if (!selectedOrganization) {
      setFormError('Choose an existing organization or create it first.');
      return;
    }
    if (!title || !expectedCloseDate || !selectedPersonName || !owner || !product || (isQualified && (!selectedPipeline || !selectedStage))) {
      setFormError(isQualified
        ? 'Qualified opportunities must be routed to an active pipeline with a stage.'
        : 'Enter a valid expected close date in DD-MMM-YYYY format, a title, a sales person, choose an owner and product, and complete required fields.');
      return;
    }
    if (!leadCurrency || !Number.isFinite(amount) || amount < 0 ||
      (leadCurrency === 'USD' && (!Number.isFinite(rate) || !rate || rate <= 0))) {
      setFormError('Choose a currency, enter a non-negative lead value, and enter a positive exchange rate for USD.');
      return;
    }

    const valueMvr = toMvr(amount, leadCurrency, rate);
    const lead: Lead = {
      ...(editingLead ?? {}),
      id: editingLead?.id ?? `L-${crypto.randomUUID()}`,
      personId: person?.id,
      person: selectedPersonName,
      clientId: selectedOrganization.id,
      client: selectedOrganization.name,
      title,
      value: amount,
      valueMvr,
      brokerageRatePct: product.standardBrokerageRatePct,
      brokerageCommission: calculateBrokerageCommission(amount, product),
      currency: leadCurrency,
      exchangeRate: rate,
      ...(isQualified && selectedPipeline ? { pipelineId: selectedPipeline.id } : {}),
      closeDate: expectedCloseDate,
      visibility: 'individual',
      contact: selectedPersonName,
      country: selectedOrganization.country,
      insuranceClass: product.category,
      productCode: product.code,
      temperature: editingLead?.temperature ?? 'WARM',
      status: editingLead?.status ?? 'TO-DO',
      funnelStage: isQualified && selectedStage
        ? editingLead?.pipelineId === selectedPipeline?.id ? editingLead?.funnelStage ?? selectedStage.name : selectedStage.name
        : leadFunnelStage,
      renewalDate: expectedCloseDate,
      sumInsured: valueMvr,
      premium: valueMvr,
      ownerId: owner.id,
      lastActivity: editingLead?.lastActivity ?? 'Just now',
      leadFunnelStage,
      ...(isQualified ? { dealId: editingLead?.dealId ?? `D-${Date.now()}` } : {}),
      ...(isQualified && selectedPipeline ? { routedAt: editingLead?.routedAt ?? new Date().toISOString() } : {}),
    };
    if (!personOptions.some((name) => name.toLowerCase() === selectedPersonName.toLowerCase())) {
      setCustomerLookups((current) => ({
        ...current,
        salesPersons: [...current.salesPersons, selectedPersonName],
      }));
    }
    setLeads((current) => editingLead
      ? current.map((existing) => existing.id === editingLead.id ? lead : existing)
      : [lead, ...current]);
    setNewLeadOpen(false);
    resetLeadForm();
    if (selectedPipeline) setSelectedPipelineId(selectedPipeline.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor="lead-pipeline-filter">Pipeline</label>
          <select
            id="lead-pipeline-filter"
            className="input w-auto min-w-52"
            value={boardPipeline?.id ?? ''}
            onChange={(event) => { setSelectedPipelineId(event.target.value); setStageFilter(''); }}
          >
            {activePipelines.length === 0 && <option value="">No pipelines available</option>}
            {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !py-1.5" onClick={() => setFilterOpen(true)}><Filter size={14} /> Filter</button>
          <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
            <button aria-label="Kanban view" aria-pressed={view === 'kanban'} onClick={() => setView('kanban')} className={`p-1.5 rounded-md ${view === 'kanban' ? 'bg-ink-700 text-white' : 'text-muted'}`}><Columns3 size={15} /></button>
            <button aria-label="Table view" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`p-1.5 rounded-md ${view === 'table' ? 'bg-ink-700 text-white' : 'text-muted'}`}><List size={15} /></button>
          </div>
          <button className="btn-primary !py-1.5" onClick={openLeadForm} disabled={activePipelines.length === 0} title={activePipelines.length === 0 ? 'Create a pipeline before adding a lead' : undefined}><Plus size={14} /> Add Lead</button>
        </div>
      </div>

      {activePipelines.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted">Create an active pipeline and at least one stage before adding leads.</div>
      ) : boardStages.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted">Add at least one stage to this pipeline before adding leads.</div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {boardStages.map((stage) => {
            const stageLeads = visibleLeads.filter((lead) => lead.funnelStage === stage.name);
            return (
              <div key={stage.id} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="text-sm font-semibold text-white">{stage.name}</div>
                  <span className="pill bg-ink-700 text-muted border border-ink-600">{stageLeads.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px] bg-ink-900/40 rounded-xl p-2">
                  {stageLeads.map((lead) => (
                    <article key={lead.id} className="glass-soft rounded-xl p-3">
                      <h3 className="text-sm font-semibold text-white">{lead.title ?? `${lead.client} lead`}</h3>
                      <div className="text-[11px] text-muted mt-1">{lead.client} · Person: {lead.person ?? lead.contact}</div>
                      <div className="text-[11px] text-muted mt-1">Owner: {staffOptions.find((item) => item.id === lead.ownerId)?.name ?? lead.ownerId}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="brand">{PRODUCT_CODES.find((product) => product.code === lead.productCode)?.name ?? lead.productCode}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted pt-2 mt-2 border-t border-ink-700/60">
                        <span>{formatAmount(lead.value ?? lead.premium, lead.currency ?? 'MVR')}</span>
                        {lead.currency === 'USD' && <span>{formatAmount(lead.valueMvr ?? lead.premium, 'MVR')}</span>}
                      </div>
                      <div className="text-[11px] text-muted mt-1">Expected close {formatDate(lead.closeDate ?? lead.renewalDate)}</div>
                      {(user.role === 'admin' || user.role === 'sales') && (
                        <button type="button" className="btn-ghost mt-2 !py-1.5" onClick={() => openEditLead(lead)}>
                          <Pencil size={13} /> Edit Lead
                        </button>
                      )}
                    </article>
                  ))}
                  {stageLeads.length === 0 && <div className="text-center text-[11px] text-muted/60 py-8">No leads in this stage.</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title / Organization</th>
                <th className="text-left px-4 py-3 font-medium">Person</th>
                <th className="text-left px-4 py-3 font-medium">Owner</th>
                <th className="text-left px-4 py-3 font-medium">Product Class</th>
                <th className="text-right px-4 py-3 font-medium">Lead Value</th>
                <th className="text-left px-4 py-3 font-medium">Expected Close</th>
                {(user.role === 'admin' || user.role === 'sales') && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleLeads.map((lead) => (
                <tr key={lead.id} className="table-row">
                  <td className="px-4 py-3"><div className="text-white font-medium">{lead.title ?? `${lead.client} lead`}</div><div className="text-[11px] text-muted">{lead.client}</div></td>
                  <td className="px-4 py-3 text-muted">{lead.person ?? lead.contact}</td>
                  <td className="px-4 py-3 text-muted">{staffOptions.find((item) => item.id === lead.ownerId)?.name ?? lead.ownerId}</td>
                  <td className="px-4 py-3 text-muted">{PRODUCT_CODES.find((product) => product.code === lead.productCode)?.name ?? lead.insuranceClass}</td>
                  <td className="px-4 py-3 text-right text-white"><div>{formatAmount(lead.value ?? lead.premium, lead.currency ?? 'MVR')}</div>{lead.currency === 'USD' && <div className="text-[11px] text-muted">{formatAmount(lead.valueMvr ?? lead.premium, 'MVR')}</div>}<div className="text-[11px] text-brand-300">Brokerage budget: {formatAmount(lead.brokerageCommission ?? calculateBrokerageCommission(lead.value ?? lead.premium, PRODUCT_CODES.find((product) => product.code === lead.productCode)), lead.currency ?? 'MVR')} ({lead.brokerageRatePct ?? PRODUCT_CODES.find((product) => product.code === lead.productCode)?.standardBrokerageRatePct ?? 0}%)</div></td>
                  <td className="px-4 py-3 text-muted">{formatDate(lead.closeDate ?? lead.renewalDate)}</td>
                  {(user.role === 'admin' || user.role === 'sales') && (
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="btn-ghost !py-1.5" onClick={() => openEditLead(lead)}>
                        <Pencil size={13} /> Edit Lead
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {visibleLeads.length === 0 && <tr><td colSpan={user.role === 'admin' || user.role === 'sales' ? 7 : 6} className="px-4 py-8 text-center text-muted">No leads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {prePipelineLeads.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-semibold">Pre-Pipeline Lead Funnel</h2>
              <p className="text-xs text-muted mt-1">Qualify Leads through L0–L3 before routing them to an active pipeline.</p>
            </div>
            <Badge variant="brand">{prePipelineLeads.length} Leads</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {PRE_PIPELINE_STAGES.map((stage) => {
              const stageLeads = prePipelineLeads.filter((lead) => lead.leadFunnelStage === stage);
              return <div key={stage} className="rounded-xl bg-ink-900/50 p-3">
                <div className="flex items-center justify-between text-sm text-white"><span>{stage}</span><Badge variant="muted">{stageLeads.length}</Badge></div>
                <div className="mt-3 space-y-2">
                  {stageLeads.map((lead) => <button key={lead.id} type="button" onClick={() => openEditLead(lead)} className="w-full rounded-lg border border-ink-700 p-2 text-left hover:border-brand-400/50">
                    <div className="text-xs font-medium text-white truncate">{lead.client}</div>
                    <div className="text-[11px] text-muted truncate">{lead.title ?? 'Untitled lead'}{lead.dealId ? ` · ${lead.dealId}` : ''}</div>
                  </button>)}
                  {stageLeads.length === 0 && <div className="py-4 text-center text-[11px] text-muted/60">No Leads</div>}
                </div>
              </div>;
            })}
          </div>
        </section>
      )}

      <Modal
        open={newLeadOpen}
        onClose={() => { setNewLeadOpen(false); resetLeadForm(); }}
        title={editingLead ? 'Edit Lead' : 'Add Lead'}
        subtitle={editingLead ? 'Update this lead in its sales pipeline.' : 'Create a lead in a sales pipeline.'}
        size="lg"
        footer={<><button type="button" className="btn-ghost" onClick={() => { setNewLeadOpen(false); resetLeadForm(); }}><X size={14} /> Cancel</button><button type="submit" form="new-lead-form" className="btn-primary"><Plus size={14} /> {editingLead ? 'Update Lead' : 'Save Lead'}</button></>}
      >
        <form id="new-lead-form" onSubmit={createLead} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Sales Person">
            <input
              className="input"
              list="lead-sales-persons"
              required
              maxLength={120}
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Select or type a sales person"
              autoComplete="off"
            />
            <datalist id="lead-sales-persons">
              {personOptions.map((person) => <option key={person} value={person} />)}
            </datalist>
            <p className="mt-1 text-[11px] text-muted">New names are saved to the sales-person list when the lead is created.</p>
          </Field>
          <Field label="Organization">
            <input
              className="input"
              list="lead-organizations"
              required
              value={organizationQuery}
              onChange={(event) => setOrganizationQuery(event.target.value)}
              onBlur={() => {
                if (organizationQuery.trim() && !clients.some((client) => client.name.trim().toLowerCase() === organizationQuery.trim().toLowerCase())) {
                  setNewOrganizationOpen(true);
                }
              }}
              placeholder="Search or enter an organization"
            />
            <datalist id="lead-organizations">
              {clients.map((client) => <option key={client.id} value={client.name} />)}
            </datalist>
            {organizationQuery.trim() && !selectedOrganization && <p className="mt-1 text-xs text-warm">This organization is new. Create it to continue.</p>}
          </Field>
          <Field label="Title *"><input className="input" name="title" maxLength={200} required value={leadTitle} onChange={(event) => setLeadTitle(event.target.value)} /></Field>
          <Field label="Type of Insurance Product *">
            <ProductSelect
              pipelines={pipelines}
              name="productCode"
              value={productCode}
              required
              onChange={(product) => setProductCode(product?.code ?? '')}
            />
          </Field>
          <Field label="Pre-pipeline stage">
            <select className="input" value={leadFunnelStage} onChange={(event) => setLeadFunnelStage(event.target.value as LeadFunnelStage)}>
              {PRE_PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </Field>
          <Field label="Pipeline">
            <select className="input" value={selectedPipelineId} onChange={(event) => setSelectedPipelineId(event.target.value)}>
              <option value="">{leadFunnelStage === 'L3: Qualified Opportunity' ? 'Select pipeline to route' : 'Not routed yet'}</option>
              {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className="input" value={selectedStageId} required={leadFunnelStage === 'L3: Qualified Opportunity'} onChange={(event) => setSelectedStageId(event.target.value)}>
              <option value="">Select stage</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </Field>
          <Field label="Lead Value Currency">
            <select className="input" required value={leadCurrency} onChange={(event) => {
              const currency = event.target.value as Currency | '';
              setLeadCurrency(currency);
              setLeadValue('');
              setExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : '');
            }}>
              <option value="">Select currency</option><option value="USD">USD</option><option value="MVR">MVR</option>
            </select>
          </Field>
          <Field label={`Total Insured Value${leadCurrency ? ` (${leadCurrency})` : ''}`}>
            <input className="input" name="value" type="number" min="0" step="0.01" required value={leadValue} onChange={(event) => setLeadValue(event.target.value)} />
          </Field>
          {productCode && Number(leadValue) >= 0 && PRODUCT_CODES.find((product) => product.code === productCode) && <p className="self-end text-sm text-brand-300">Tentative Brokerage: {formatAmount(calculateBrokerageCommission(Number(leadValue), PRODUCT_CODES.find((product) => product.code === productCode)), leadCurrency || 'MVR')} ({PRODUCT_CODES.find((product) => product.code === productCode)?.standardBrokerageRatePct ?? 0}%)</p>}
          {leadCurrency === 'USD' && (
            <>
              <Field label="Exchange rate (MVR per USD)">
                <input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
              </Field>
              {Number(leadValue) > 0 && Number(exchangeRate) > 0 && <p className="self-end text-sm text-muted">MVR equivalent: {formatAmount(toMvr(Number(leadValue), 'USD', Number(exchangeRate)), 'MVR')}</p>}
            </>
          )}
          <Field label="Owner">
            {user.role === 'sales' ? (
              <input className="input" value={user.name} readOnly aria-readonly="true" />
            ) : (
              <select className="input" required value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                <option value="">Select owner</option>
                {staffOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Expected Close Date">
            <DateInput name="closeDate" required value={closeDate} onIsoChange={setCloseDate} aria-label="Expected close date" />
          </Field>
          {formError && <p role="alert" className="sm:col-span-2 text-sm text-hot">{formError}</p>}
          {selectedPipelineId && stages.length === 0 && <p role="alert" className="sm:col-span-2 text-sm text-hot">This pipeline has no stages. Add a stage in Pipelines before saving leads.</p>}
        </form>
      </Modal>

      <Modal
        open={newOrganizationOpen}
        onClose={() => setNewOrganizationOpen(false)}
        title="Create New Customer / Organization"
        subtitle="The lead form will remain open while you add this organization."
        size="sm"
        layer="overlay"
        footer={<><button type="button" className="btn-ghost" onClick={() => setNewOrganizationOpen(false)}>Cancel</button><button type="submit" form="new-organization-form" className="btn-primary"><Plus size={14} /> Create Organization</button></>}
      >
        <form id="new-organization-form" onSubmit={createOrganization}>
          <Field label="Organization name"><input className="input" name="name" defaultValue={organizationQuery} required autoFocus /></Field>
        </form>
      </Modal>

      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Leads" size="sm" footer={<><button type="button" className="btn-ghost" onClick={() => { setTemperatureFilter(''); setStageFilter(''); }}>Clear</button><button type="button" className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button></>}>
        <div className="space-y-3">
          <Field label="Pipeline stage"><select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{boardStages.map((stage) => <option key={stage.id} value={stage.name}>{stage.name}</option>)}</select></Field>
          <Field label="Temperature"><select className="input" value={temperatureFilter} onChange={(event) => setTemperatureFilter(event.target.value)}><option value="">All temperatures</option><option>HOT</option><option>WARM</option><option>COLD</option></select></Field>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}

