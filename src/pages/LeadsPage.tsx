import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { CalendarDays, CheckCircle2, CircleDot, Columns3, Filter, List, Mail, Plus, Search, ShieldCheck, TrendingUp, UserRound, X, Pencil } from 'lucide-react';
import type { Client, Lead } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';
import { hashParams } from '../utils/navigation';
import { formatDate, normalizeDateInput } from '../utils/date';
import DateInput from '../components/ui/DateInput';
import ProductSelect from '../components/ui/ProductSelect';
import { calculateBrokerageCommission } from '../utils/insurance';
import { hasCompleteCommunicationChannels } from '../utils/communication';
import { hasCompleteClientProfile, INCOMPLETE_COMPANY_TAG } from '../utils/customerProfile';
import DealWorkspace from './DealWorkspace';

const LEAD_FUNNEL_STAGES = [
  'Lead Identified',
  'Contact Made',
  'Key Person Identified',
  'Intro Email Sent',
  'Meetings Ongoing',
  'Qualified to Deals',
] as const;

type LeadBoardStage = (typeof LEAD_FUNNEL_STAGES)[number];

function boardStageForLead(lead: Lead, linkedDealIds: ReadonlySet<string>): LeadBoardStage {
  if (lead.dealId && linkedDealIds.has(lead.dealId)) return 'Qualified to Deals';
  const stage = lead.funnelStage.toLowerCase();
  if (stage.includes('qualified to deal') || stage.includes('qualified opportunity') || stage.includes('bound') || stage.includes('won')) return 'Qualified to Deals';
  if (stage.includes('meeting') || stage.includes('negotiat') || stage.includes('underwriter')) return 'Meetings Ongoing';
  if (stage.includes('intro') || stage.includes('email') || stage.includes('quoted')) return 'Intro Email Sent';
  if (stage.includes('key person') || stage.includes('comparative') || stage.includes('presentation') || stage.includes('quote comparison') || stage.includes('lob scoping')) return 'Key Person Identified';
  if (stage.includes('contact') || stage.includes('market') || stage.includes('tender') || stage.includes('slip') || stage.includes('kyc')) return 'Contact Made';
  if (stage.includes('l3:')) return 'Qualified to Deals';
  if (stage.includes('l2:')) return 'Key Person Identified';
  if (stage.includes('l1:')) return 'Contact Made';
  return 'Lead Identified';
}

function boardStageIcon(stage: LeadBoardStage) {
  if (stage === 'Lead Identified') return CircleDot;
  if (stage === 'Contact Made') return UserRound;
  if (stage === 'Key Person Identified') return ShieldCheck;
  if (stage === 'Intro Email Sent') return Mail;
  if (stage === 'Meetings Ongoing') return CalendarDays;
  return CheckCircle2;
}

export default function LeadsPage() {
  const {
    leads, setLeads, deals, clients, setClients, user, users, pipelines,
    customerLookups, setCustomerLookups, products, activities, setActivities,
  } = useApp();
  const PRODUCT_CODES = products;
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [view, setView] = useState<'list' | 'funnel' | 'forecast'>('funnel');
  const [searchQuery, setSearchQuery] = useState('');
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [inspectedLeadId, setInspectedLeadId] = useState('');
  const [pendingLeadStageChange, setPendingLeadStageChange] = useState<{ from: LeadBoardStage; to: LeadBoardStage } | null>(null);
  const [stageChangeRemarks, setStageChangeRemarks] = useState('');
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [organizationContactName, setOrganizationContactName] = useState('');
  const [organizationContactEmail, setOrganizationContactEmail] = useState('');
  const [organizationContactPhone, setOrganizationContactPhone] = useState('');
  const [personName, setPersonName] = useState('');
  const [primaryContactName, setPrimaryContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [leadSource, setLeadSource] = useState('');
  const [leadNotes, setLeadNotes] = useState('');
  const [productCode, setProductCode] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [leadBoardStage, setLeadBoardStage] = useState<LeadBoardStage>('Lead Identified');
  const [leadCurrency, setLeadCurrency] = useState<Currency | ''>('');
  const [leadValue, setLeadValue] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [formError, setFormError] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState(() => hashParams().get('temperature') ?? '');
  const [stageFilter, setStageFilter] = useState(() => hashParams().get('stage') ?? '');
  const [ownerFilter, setOwnerFilter] = useState(() => hashParams().get('owner') ?? '');
  const [leadIdFilter, setLeadIdFilter] = useState(() => hashParams().get('id') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => hashParams().get('status') ?? '');
  const [insuranceClassFilter, setInsuranceClassFilter] = useState(() => hashParams().get('insuranceClass') ?? '');
  const [pendingLeadDeletion, setPendingLeadDeletion] = useState<Lead | null>(null);
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const linkedDealIds = useMemo(() => new Set(deals.map((deal) => deal.id)), [deals]);
  const selectedPipeline = activePipelines.find((pipeline) => pipeline.id === selectedPipelineId);
  const selectedOrganization = clients.find(
    (client) => client.name.trim().toLowerCase() === organizationQuery.trim().toLowerCase(),
  );
  const fieldErrors = {
    personName: validationAttempted && !personName.trim() ? 'Sales person is required.' : '',
    organization: validationAttempted && !selectedOrganization ? 'Choose an existing organization or create it first.' : '',
    primaryContactName: validationAttempted && !primaryContactName.trim() ? 'Primary contact name is required.' : '',
    contactEmail: !validationAttempted ? '' : !contactEmail.trim()
      ? 'Contact email is required.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) ? '' : 'Enter a valid contact email address.',
    contactPhone: !validationAttempted ? '' : !contactPhone.trim()
      ? 'Contact phone is required.'
      : /^[+()\d\s-]{7,}$/.test(contactPhone.trim()) ? '' : 'Enter a valid contact phone number.',
    leadTitle: validationAttempted && !leadTitle.trim() ? 'Title is required.' : '',
    productCode: validationAttempted && !productCode ? 'Insurance product is required.' : '',
    selectedPipelineId: validationAttempted && !selectedPipeline ? 'Deal pipeline is required.' : '',
    ownerId: validationAttempted && !ownerId ? 'Owner is required.' : '',
    closeDate: validationAttempted && !normalizeDateInput(closeDate) ? 'Expected close date is required.' : '',
    leadCurrency: validationAttempted && !leadCurrency ? 'Currency is required.' : '',
    leadValue: !validationAttempted || (leadValue.trim() && Number.isFinite(Number(leadValue)) && Number(leadValue) >= 0)
      ? '' : 'Enter a non-negative lead value.',
    exchangeRate: !validationAttempted || leadCurrency !== 'USD' || (Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0)
      ? '' : 'Enter a positive exchange rate for USD.',
  };
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
  const boardPipeline = selectedPipeline
    ?? activePipelines.find((pipeline) => pipeline.code === 'COMMERCIAL')
    ?? activePipelines[0];
  useEffect(() => {
    if (boardPipeline && selectedPipelineId !== boardPipeline.id) setSelectedPipelineId(boardPipeline.id);
  }, [boardPipeline, selectedPipelineId]);
  useEffect(() => {
    if (editingLead || titleManuallyEdited) return;
    const product = products.find((item) => item.code === productCode);
    if (organizationQuery.trim() && product) setLeadTitle(`${organizationQuery.trim()} - ${product.name}`);
  }, [editingLead, organizationQuery, productCode, products, titleManuallyEdited]);
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
    (!stageFilter || lead.funnelStage === stageFilter || boardStageForLead(lead, linkedDealIds) === stageFilter) &&
    (!ownerFilter || lead.ownerId === ownerFilter) &&
    (!leadIdFilter || lead.id === leadIdFilter) &&
    (!insuranceClassFilter || lead.insuranceClass === insuranceClassFilter) &&
    (!statusFilter || (statusFilter === 'active' ? lead.status !== 'COMPLETED' : lead.status === statusFilter));
  const visibleLeads = leads.filter(matchesLeadFilters);
  const searchedLeads = visibleLeads.filter((lead) => {
    const owner = staffOptions.find((candidate) => candidate.id === lead.ownerId)?.name ?? lead.ownerId;
    const product = products.find((candidate) => candidate.code === lead.productCode);
    const search = `${lead.title ?? ''} ${lead.client} ${lead.contact} ${owner} ${lead.insuranceClass} ${lead.productCode} ${product?.name ?? ''}`.toLowerCase();
    return search.includes(searchQuery.trim().toLowerCase());
  });
  const leadsByBoardStage = LEAD_FUNNEL_STAGES.map((stage) => ({
    stage,
    leads: searchedLeads.filter((lead) => boardStageForLead(lead, linkedDealIds) === stage),
  }));
  const moveLeadToStage = (lead: Lead, stage: LeadBoardStage) => {
    if (stage === boardStageForLead(lead, linkedDealIds)) return;
    if (lead.dealId && linkedDealIds.has(lead.dealId)) return;
    setPendingLeadStageChange({ from: boardStageForLead(lead, linkedDealIds), to: stage });
    setStageChangeRemarks('');
    openEditLead(lead);
    setLeadBoardStage(stage);
  };

  const deleteLead = (lead: Lead) => {
    if (user.role !== 'admin' && user.role !== 'sales') return;
    const linkedDeal = deals.some((deal) => deal.id === lead.dealId || deal.leadId === lead.id);
    if (linkedDeal) {
      window.alert('This Lead cannot be deleted because it has an associated Deal. Reassign or delete the associated Deal first.');
      return;
    }
    setPendingLeadDeletion(lead);
  };

  const confirmDeleteLead = () => {
    if (!pendingLeadDeletion) return;
    setLeads((current) => current.filter((item) => item.id !== pendingLeadDeletion.id));
    setPendingLeadDeletion(null);
  };

  const resetLeadForm = () => {
    setEditingLead(null);
    setOrganizationQuery('');
    setOrganizationContactName('');
    setOrganizationContactEmail('');
    setOrganizationContactPhone('');
    setPersonName('');
    setPrimaryContactName('');
    setContactEmail('');
    setContactPhone('');
    setLeadTitle('');
    setTitleManuallyEdited(false);
    setLeadSource('');
    setLeadNotes('');
    setProductCode('');
    setCloseDate('');
    setOwnerId(user.id);
    setLeadBoardStage('Lead Identified');
    setPersonName(user.name);
    setLeadCurrency('');
    setLeadValue('');
    setExchangeRate('');
    setFormError('');
    setValidationAttempted(false);
    setPendingLeadStageChange(null);
    setStageChangeRemarks('');
    setSelectedPipelineId(boardPipeline?.id ?? '');
    setNewOrganizationOpen(false);
  };

  const openLeadForm = () => {
    resetLeadForm();
    setNewLeadOpen(true);
  };

  const openEditLead = (lead: Lead) => {
    if (user.role !== 'admin' && user.role !== 'sales') return;
    setFormError('');
    setValidationAttempted(false);
    setEditingLead(lead);
    setOrganizationQuery(lead.client);
    setPersonName(lead.person ?? lead.contact);
    setPrimaryContactName(lead.contact);
    setContactEmail(lead.contactEmail ?? '');
    setContactPhone(lead.contactPhone ?? '');
    setLeadTitle(lead.title ?? `${lead.client} lead`);
    setTitleManuallyEdited(true);
    setLeadSource(lead.source ?? '');
    setLeadNotes(lead.notes ?? '');
    setProductCode(lead.productCode);
    setCloseDate(lead.closeDate ?? lead.renewalDate);
    setOwnerId(lead.ownerId);
    setLeadBoardStage(boardStageForLead(lead, linkedDealIds));
    setSelectedPipelineId(lead.pipelineId ?? boardPipeline?.id ?? '');
    setLeadCurrency(lead.currency ?? 'MVR');
    setLeadValue(String(lead.value ?? lead.premium));
    setExchangeRate(lead.currency === 'USD' ? String(lead.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE) : '');
    setNewLeadOpen(true);
  };

  const createOrganization = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const contactName = String(data.get('contactName') ?? '').trim();
    const email = String(data.get('contactEmail') ?? '').trim();
    const phone = String(data.get('contactPhone') ?? '').trim();
    if (!name || !contactName || !email || !phone) {
      setFormError('Complete the organization name, primary contact name, contact email, and contact phone before creating the organization.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+()\d\s-]{7,}$/.test(phone)) {
      setFormError('Enter a valid organization contact email and phone number.');
      return;
    }
    const existing = clients.find((client) => client.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setOrganizationQuery(existing.name);
      setNewOrganizationOpen(false);
      setFormError('');
      return;
    }

    const organization: Client = {
      id: `org-${crypto.randomUUID()}`,
      name,
      tin: '',
      country: '',
      phone,
      email,
      address: '',
      sumInsured: 0,
      premium: 0,
      expiry: '',
      insurer: '',
      productCode: '',
      class: '',
      ownerId: user.id,
      tags: [INCOMPLETE_COMPANY_TAG],
      contactPerson: contactName,
      accountStatus: 'draft',
    };
    setClients((current) => [organization, ...current]);
    setOrganizationQuery(name);
    setPrimaryContactName(contactName);
    setContactEmail(email);
    setContactPhone(phone);
    setNewOrganizationOpen(false);
    setFormError('');
  };

  const createLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user.role !== 'admin' && user.role !== 'sales') return;
    setValidationAttempted(true);
    setFormError('');
    const data = new FormData(event.currentTarget);
    const title = leadTitle.trim();
    const product = products.find((item) => item.code === productCode);
    const selectedPersonName = personName.trim();
    const primaryContact = primaryContactName.trim();
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    const whatsapp = String(data.get('whatsapp') ?? '').trim();
    const telegram = String(data.get('telegram') ?? '').trim();
    const person = users.find((candidate) =>
      candidate.role === 'sales' && candidate.name.trim().toLowerCase() === selectedPersonName.toLowerCase(),
    );
    const owner = staffOptions.find((candidate) => candidate.id === ownerId);
    const amount = Number(data.get('value'));
    const rate = leadCurrency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const expectedCloseDate = normalizeDateInput(closeDate);

    if (!selectedOrganization) {
      setFormError('Choose an existing organization or create it first.');
      return;
    }
    if (!title || !expectedCloseDate || !selectedPersonName || !primaryContact || !email || !phone || !owner || !product || !selectedPipeline) {
      setFormError('Complete Organization, Primary Contact Name, Contact Email, Contact Phone, Lead Title, Insurance Product, Pipeline, Owner, and Expected Close Date before saving.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Enter a valid contact email address.');
      return;
    }
    if (!/^[+()\d\s-]{7,}$/.test(phone)) {
      setFormError('Enter a valid contact phone number.');
      return;
    }
    if (leadBoardStage === 'Qualified to Deals' &&
      (!hasCompleteCommunicationChannels({ contactPhone: phone, whatsapp, telegram }) || !hasCompleteClientProfile(selectedOrganization))) {
      setFormError('Complete the company profile and enter valid phone, WhatsApp, and Telegram details before qualifying this lead for a deal.');
      return;
    }
    if (pendingLeadStageChange && pendingLeadStageChange.to === 'Qualified to Deals'
      && (!hasCompleteCommunicationChannels({ contactPhone: phone, whatsapp, telegram }) || !hasCompleteClientProfile(selectedOrganization))) {
      setFormError('Complete client details and valid phone, WhatsApp, and Telegram information before saving this stage change.');
      return;
    }
    if (!leadCurrency || !leadValue.trim() || !Number.isFinite(amount) || amount < 0 ||
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
      pipelineId: selectedPipeline.id,
      closeDate: expectedCloseDate,
      visibility: 'individual',
      contact: primaryContact,
      contactEmail: email,
      contactPhone: phone,
      whatsapp,
      telegram,
      source: leadSource.trim(),
      notes: leadNotes.trim(),
      country: selectedOrganization.country,
      insuranceClass: product.category,
      productCode: product.code,
      temperature: editingLead?.temperature ?? 'WARM',
      status: editingLead?.status ?? 'TO-DO',
      funnelStage: leadBoardStage,
      renewalDate: expectedCloseDate,
      sumInsured: valueMvr,
      premium: valueMvr,
      ownerId: owner.id,
      lastActivity: editingLead?.lastActivity ?? 'Just now',
      ...(leadBoardStage === 'Qualified to Deals' ? { leadFunnelStage: 'L3: Qualified Opportunity' as const } : { leadFunnelStage: undefined }),
      ...(editingLead?.dealId ? { dealId: editingLead.dealId } : {}),
      routedAt: editingLead?.routedAt ?? new Date().toISOString(),
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
    if (editingLead && pendingLeadStageChange) {
      const from = pendingLeadStageChange.from;
      const to = pendingLeadStageChange.to;
      setActivities([{
        id: `activity-${crypto.randomUUID()}`,
        clientId: selectedOrganization.id,
        type: 'note',
        title: `Lead stage changed: ${from} → ${to}`,
        description: stageChangeRemarks.trim() || `Lead moved from ${from} to ${to}.`,
        date: new Date().toISOString(),
        userId: user.id,
      }, ...activities]);
    }
    setNewLeadOpen(false);
    resetLeadForm();
    if (selectedPipeline) setSelectedPipelineId(selectedPipeline.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-800/60 p-1" role="tablist" aria-label="Lead views">
          <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} className={`rounded-md px-3 py-1.5 text-sm ${view === 'list' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}><List size={14} className="mr-1.5 inline" />List</button>
          <button role="tab" aria-selected={view === 'funnel'} onClick={() => setView('funnel')} className={`rounded-md px-3 py-1.5 text-sm ${view === 'funnel' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}><Columns3 size={14} className="mr-1.5 inline" />Funnel</button>
          <button role="tab" aria-selected={view === 'forecast'} onClick={() => setView('forecast')} className={`rounded-md px-3 py-1.5 text-sm ${view === 'forecast' ? 'bg-ink-700 text-white' : 'text-muted hover:text-white'}`}><TrendingUp size={14} className="mr-1.5 inline" />Forecast</button>
        </div>
        <button className="btn-primary" onClick={openLeadForm} disabled={activePipelines.length === 0} title={activePipelines.length === 0 ? 'Create an active pipeline before adding a lead' : undefined}><Plus size={15} /> Add a New Lead</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search leads" aria-label="Search leads" />
        </label>
        <button className="btn-ghost" onClick={() => setFilterOpen(true)}><Filter size={14} /> Filter</button>
      </div>

      {inspectedLeadId ? (
        <DealWorkspace
          deals={deals}
          initialSelectedKey={`lead:${inspectedLeadId}`}
          onClose={() => setInspectedLeadId('')}
        />
      ) : activePipelines.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted">Create an active pipeline before adding leads.</div>
      ) : view === 'funnel' ? (
        <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[1560px] grid-cols-6 gap-3">
          {leadsByBoardStage.map(({ stage, leads: stageLeads }) => {
            const StageIcon = boardStageIcon(stage);
            const aggregateMvr = stageLeads.reduce((total, lead) => total + (lead.valueMvr ?? toMvr(lead.value ?? lead.premium, lead.currency ?? 'MVR', lead.exchangeRate)), 0);
            const showAggregate = stage === 'Contact Made' || stage === 'Intro Email Sent';
            return <section key={stage} className="min-w-0 rounded-xl border border-ink-700 bg-ink-900/55 p-2.5"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData('text/lead-id');
                const lead = searchedLeads.find((item) => item.id === leadId);
                if (lead) moveLeadToStage(lead, stage);
              }}>
              <header className="mb-2 flex min-h-11 items-start justify-between gap-2 px-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><StageIcon size={15} className="shrink-0 text-brand-300" /><h2>{stage}</h2></div>
                <Badge variant="muted">{stageLeads.length}</Badge>
              </header>
              {showAggregate && <div className="mb-2 rounded-lg border border-brand-400/15 bg-brand-400/5 px-2.5 py-2">
                <div className="text-[10px] uppercase tracking-wide text-muted">Aggregate MVR value</div>
                <div className="text-sm font-semibold text-brand-200">{formatAmount(aggregateMvr, 'MVR')}</div>
              </div>}
              <div className="max-h-[calc(100vh-300px)] min-h-48 space-y-2 overflow-y-auto rounded-lg bg-ink-950/40 p-1.5">
                {stageLeads.map((lead) => {
                  const ownerName = staffOptions.find((item) => item.id === lead.ownerId)?.name ?? lead.ownerId;
                  const product = PRODUCT_CODES.find((item) => item.code === lead.productCode);
                  const CompanyIcon = lead.status === 'COMPLETED' ? CheckCircle2 : CircleDot;
                  const isLinked = Boolean(lead.dealId && linkedDealIds.has(lead.dealId));
                  return <article key={lead.id} draggable={!isLinked}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/lead-id', lead.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => setInspectedLeadId(lead.id)}
                    className={`rounded-lg border border-ink-700 bg-ink-800/80 p-3 shadow-sm transition hover:border-brand-400/50 ${isLinked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setInspectedLeadId(lead.id); }} className="min-w-0 text-left">
                        <h3 className="truncate text-sm font-bold text-white">{lead.title ?? `${lead.client} lead`}</h3>
                      </button>
                      <CompanyIcon size={15} className={lead.status === 'COMPLETED' ? 'shrink-0 text-emerald-400' : lead.temperature === 'HOT' ? 'shrink-0 text-hot' : 'shrink-0 text-brand-300'} aria-label={lead.status === 'COMPLETED' ? 'Completed' : lead.temperature === 'HOT' ? 'Hot lead' : 'Active lead'} />
                    </div>
                    <div className="truncate text-xs text-muted">{lead.client}</div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-600 text-[9px] font-semibold text-white">{ownerName.slice(0, 1).toUpperCase()}</span><span className="truncate">Rep: {ownerName}</span></div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="brand">{product?.category ?? lead.insuranceClass}</Badge>
                      <Badge variant="muted">{product?.code ?? lead.productCode}</Badge>
                      <Badge variant={lead.temperature === 'HOT' ? 'hot' : 'muted'}>{lead.temperature ?? 'WARM'}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-ink-700/80 pt-2 text-[11px]">
                      <span className="text-muted">MVR value</span>
                      <span className="font-medium text-white">{formatAmount(lead.valueMvr ?? toMvr(lead.value ?? lead.premium, lead.currency ?? 'MVR', lead.exchangeRate), 'MVR')}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted">Expected close {formatDate(lead.closeDate ?? lead.renewalDate)}</div>
                    <label className="mt-2 block">
                      <span className="sr-only">Move {lead.title ?? lead.client} to stage</span>
                      <select className="input !min-h-8 !py-1 text-[11px]" value={boardStageForLead(lead, linkedDealIds)} disabled={isLinked} onClick={(event) => event.stopPropagation()} onChange={(event) => moveLeadToStage(lead, event.target.value as LeadBoardStage)}>
                        {LEAD_FUNNEL_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    {(user.role === 'admin' || user.role === 'sales') && <div className="mt-2 flex justify-between border-t border-ink-700/80 pt-2">
                      <button type="button" className="btn-ghost !py-1 text-[11px]" onClick={(event) => { event.stopPropagation(); openEditLead(lead); }}><Pencil size={12} /> Edit</button>
                      <button type="button" className="btn-ghost !py-1 text-[11px] text-hot" onClick={(event) => { event.stopPropagation(); deleteLead(lead); }}>Delete</button>
                    </div>}
                  </article>;
                })}
                {stageLeads.length === 0 && <div className="py-8 text-center text-[11px] text-muted/60">No leads in this stage.</div>}
              </div>
            </section>;
          })}
        </div>
        </div>
      ) : view === 'forecast' ? (
        <div className="glass rounded-2xl p-5">
          <div className="mb-4"><h2 className="font-semibold text-white">Lead Forecast</h2><p className="mt-1 text-xs text-muted">Open lead exposure converted to MVR, grouped by funnel stage. Forecast values are unweighted estimates.</p></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {leadsByBoardStage.map(({ stage, leads: stageLeads }) => {
              const total = stageLeads.reduce((sum, lead) => sum + (lead.valueMvr ?? toMvr(lead.value ?? lead.premium, lead.currency ?? 'MVR', lead.exchangeRate)), 0);
              return <div key={stage} className="rounded-xl border border-ink-700 bg-ink-900/50 p-4">
                <div className="flex items-center justify-between text-sm text-white"><span>{stage}</span><Badge variant="muted">{stageLeads.length}</Badge></div>
                <div className="mt-3 text-xl font-semibold text-brand-200">{formatAmount(total, 'MVR')}</div>
                <div className="mt-1 text-xs text-muted">Unweighted pipeline value</div>
              </div>;
            })}
          </div>
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
                <th className="text-left px-4 py-3 font-medium">Expected Close / Notes</th>
                {(user.role === 'admin' || user.role === 'sales') && <th className="text-right px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {searchedLeads.map((lead) => (
                <tr key={lead.id} className="table-row">
                  <td className="px-4 py-3"><div className="text-white font-medium">{lead.title ?? `${lead.client} lead`}</div><div className="text-[11px] text-muted">{lead.client}</div><div className="mt-1 text-[11px] text-brand-300">{boardStageForLead(lead, linkedDealIds)}</div></td>
                  <td className="px-4 py-3 text-muted"><div>{lead.contact}</div><div className="text-[11px]">{lead.contactEmail} · {lead.contactPhone}</div></td>
                  <td className="px-4 py-3 text-muted">{staffOptions.find((item) => item.id === lead.ownerId)?.name ?? lead.ownerId}</td>
                  <td className="px-4 py-3 text-muted">{PRODUCT_CODES.find((product) => product.code === lead.productCode)?.name ?? lead.insuranceClass}</td>
                  <td className="px-4 py-3 text-right text-white"><div>{formatAmount(lead.value ?? lead.premium, lead.currency ?? 'MVR')}</div>{lead.currency === 'USD' && <div className="text-[11px] text-muted">{formatAmount(lead.valueMvr ?? lead.premium, 'MVR')}</div>}<div className="text-[11px] text-brand-300">Brokerage budget: {formatAmount(lead.brokerageCommission ?? calculateBrokerageCommission(lead.value ?? lead.premium, PRODUCT_CODES.find((product) => product.code === lead.productCode)), lead.currency ?? 'MVR')} ({lead.brokerageRatePct ?? PRODUCT_CODES.find((product) => product.code === lead.productCode)?.standardBrokerageRatePct ?? 0}%)</div></td>
                  <td className="px-4 py-3 text-muted"><div>{formatDate(lead.closeDate ?? lead.renewalDate)}</div>{lead.notes && <div className="max-w-48 truncate text-[11px]" title={lead.notes}>{lead.notes}</div>}</td>
                  {(user.role === 'admin' || user.role === 'sales') && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost !py-1.5" onClick={() => openEditLead(lead)}><Pencil size={13} /> Edit Lead</button><button type="button" className="btn-ghost !py-1.5 text-hot" onClick={() => deleteLead(lead)}>Delete</button></div>
                    </td>
                  )}
                </tr>
              ))}
              {searchedLeads.length === 0 && <tr><td colSpan={user.role === 'admin' || user.role === 'sales' ? 7 : 6} className="px-4 py-8 text-center text-muted">No leads found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={newLeadOpen}
        onClose={() => { setNewLeadOpen(false); resetLeadForm(); }}
        title={pendingLeadStageChange ? 'Update Lead Stage' : editingLead ? 'Edit Lead' : 'Add Lead'}
        subtitle={pendingLeadStageChange ? `Move from ${pendingLeadStageChange.from} to ${pendingLeadStageChange.to}.` : editingLead ? 'Update this lead in its sales pipeline.' : 'Create a lead in a sales pipeline.'}
        size="lg"
        footer={<><button type="button" className="btn-ghost" onClick={() => { setNewLeadOpen(false); resetLeadForm(); }}><X size={14} /> Cancel</button><button type="submit" form="new-lead-form" className="btn-primary"><Plus size={14} /> {editingLead ? 'Update Lead' : 'Save Lead'}</button></>}
      >
        <form id="new-lead-form" onSubmit={createLead} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SectionHeading title="Basic Information" />
          <Field label="Sales Person">
            <input
              className={inputClass(fieldErrors.personName)}
              list="lead-sales-persons"
              required
              maxLength={120}
              value={personName}
              onChange={(event) => {
                const name = event.target.value;
                setPersonName(name);
                const selectedRep = staffOptions.find((candidate) => candidate.role === 'sales' && candidate.name.toLowerCase() === name.trim().toLowerCase());
                if (selectedRep) setOwnerId(selectedRep.id);
              }}
              placeholder="Select or type a sales person"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.personName)}
            />
            {fieldErrors.personName && <p className="mt-1 text-xs text-red-400">{fieldErrors.personName}</p>}
            <datalist id="lead-sales-persons">
              {personOptions.map((person) => <option key={person} value={person} />)}
            </datalist>
            <p className="mt-1 text-[11px] text-muted">New names are saved to the sales-person list when the lead is created.</p>
          </Field>
          <Field label="Organization">
            <input
              className={inputClass(fieldErrors.organization)}
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
              aria-invalid={Boolean(fieldErrors.organization)}
            />
            <datalist id="lead-organizations">
              {clients.map((client) => <option key={client.id} value={client.name} />)}
            </datalist>
            {fieldErrors.organization && <p className="mt-1 text-xs text-red-400">{fieldErrors.organization}</p>}
            {organizationQuery.trim() && !selectedOrganization && <p className="mt-1 text-xs text-warm">This organization is new. Create it to continue.</p>}
          </Field>
          <Field label="Primary Contact Name *">
            <input className={inputClass(fieldErrors.primaryContactName)} value={primaryContactName} onChange={(event) => setPrimaryContactName(event.target.value)} required placeholder="Contact full name" aria-invalid={Boolean(fieldErrors.primaryContactName)} />
            {fieldErrors.primaryContactName && <p className="mt-1 text-xs text-red-400">{fieldErrors.primaryContactName}</p>}
          </Field>
          <Field label="Contact Email *">
            <input className={inputClass(fieldErrors.contactEmail)} type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required placeholder="name@company.com" aria-invalid={Boolean(fieldErrors.contactEmail)} />
            {fieldErrors.contactEmail && <p className="mt-1 text-xs text-red-400">{fieldErrors.contactEmail}</p>}
          </Field>
          <Field label="Contact Phone *">
            <input className={inputClass(fieldErrors.contactPhone)} type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required placeholder="+960 ..." aria-invalid={Boolean(fieldErrors.contactPhone)} />
            {fieldErrors.contactPhone && <p className="mt-1 text-xs text-red-400">{fieldErrors.contactPhone}</p>}
          </Field>
          <Field label="WhatsApp"><input className="input" name="whatsapp" type="tel" defaultValue={editingLead?.whatsapp ?? ''} placeholder="+960 ..." /></Field>
          <Field label="Telegram"><input className="input" name="telegram" defaultValue={editingLead?.telegram ?? ''} placeholder="@username or phone" /></Field>
          <SectionHeading title="Opportunity Details" />
          <Field label="Title *">
            <input className={inputClass(fieldErrors.leadTitle)} name="title" maxLength={200} required value={leadTitle} onChange={(event) => { setTitleManuallyEdited(true); setLeadTitle(event.target.value); }} aria-invalid={Boolean(fieldErrors.leadTitle)} />
            {fieldErrors.leadTitle && <p className="mt-1 text-xs text-red-400">{fieldErrors.leadTitle}</p>}
          </Field>
          <Field label="Type of Insurance Product *">
            <ProductSelect
              pipelines={pipelines}
              name="productCode"
              value={productCode}
              required
              className={inputClass(fieldErrors.productCode)}
              aria-invalid={Boolean(fieldErrors.productCode)}
              onChange={(product) => setProductCode(product?.code ?? '')}
            />
            {fieldErrors.productCode && <p className="mt-1 text-xs text-red-400">{fieldErrors.productCode}</p>}
          </Field>
          {products.find((product) => product.code === productCode) && <div className="sm:col-span-2 rounded-lg border border-ink-600 bg-ink-900/40 p-3 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-white">{products.find((product) => product.code === productCode)?.code} · {products.find((product) => product.code === productCode)?.name}</span>
              <span>{products.find((product) => product.code === productCode)?.riskLevel ?? 'Medium'} risk · {products.find((product) => product.code === productCode)?.salesCycleVelocity ?? '14–30 Days'}</span>
            </div>
            <p className="mt-1"><span className="text-white">Underwriting intake:</span> {products.find((product) => product.code === productCode)?.keyUnderwritingIntakeArtifacts}</p>
          </div>}
          <Field label="Source"><select className="input" value={leadSource} onChange={(event) => setLeadSource(event.target.value)}><option value="">Select source</option><option>Referral</option><option>Website</option><option>Renewal</option><option>Walk-in</option><option>Partner</option></select></Field>
          <Field label="Remarks / Notes"><textarea className="input min-h-20" value={leadNotes} onChange={(event) => setLeadNotes(event.target.value)} placeholder="Initial scoping, client context, or missing information" /></Field>
          <SectionHeading title="Pipeline & Progress" />
          <Field label="Funnel stage">
            <select className="input" value={leadBoardStage} onChange={(event) => {
              const nextStage = event.target.value as LeadBoardStage;
              if (editingLead) {
                const from = boardStageForLead(editingLead, linkedDealIds);
                setPendingLeadStageChange(nextStage === from ? null : { from, to: nextStage });
                setStageChangeRemarks('');
              }
              setLeadBoardStage(nextStage);
            }}>
              {LEAD_FUNNEL_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </Field>
          {pendingLeadStageChange && <div className="sm:col-span-2 rounded-lg border border-brand-400/20 bg-brand-400/5 p-3">
            <p className="mb-2 text-xs text-muted">Stage change: <span className="text-white">{pendingLeadStageChange.from} → {pendingLeadStageChange.to}</span></p>
            <Field label="Remarks / Notes (optional)"><textarea className="input min-h-20" value={stageChangeRemarks} onChange={(event) => setStageChangeRemarks(event.target.value)} placeholder="Add stage-change notes to the activity timeline." maxLength={2000} /></Field>
          </div>}
          <Field label="Deal pipeline">
            <select className={inputClass(fieldErrors.selectedPipelineId)} value={selectedPipelineId} onChange={(event) => setSelectedPipelineId(event.target.value)} aria-invalid={Boolean(fieldErrors.selectedPipelineId)}>
              <option value="">Select deal pipeline</option>
              {activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
            {fieldErrors.selectedPipelineId && <p className="mt-1 text-xs text-red-400">{fieldErrors.selectedPipelineId}</p>}
          </Field>
          <SectionHeading title="Valuation & Financials" />
          <Field label="Lead Value Currency">
            <select className={inputClass(fieldErrors.leadCurrency)} required value={leadCurrency} onChange={(event) => {
              const currency = event.target.value as Currency | '';
              setLeadCurrency(currency);
              setLeadValue('');
              setExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : '');
            }} aria-invalid={Boolean(fieldErrors.leadCurrency)}>
              <option value="">Select currency</option><option value="USD">USD</option><option value="MVR">MVR</option>
            </select>
            {fieldErrors.leadCurrency && <p className="mt-1 text-xs text-red-400">{fieldErrors.leadCurrency}</p>}
          </Field>
          <Field label={`Total Insured Value${leadCurrency ? ` (${leadCurrency})` : ''}`}>
            <input className={inputClass(fieldErrors.leadValue)} name="value" type="number" min="0" step="0.01" required value={leadValue} onChange={(event) => setLeadValue(event.target.value)} aria-invalid={Boolean(fieldErrors.leadValue)} />
            {fieldErrors.leadValue && <p className="mt-1 text-xs text-red-400">{fieldErrors.leadValue}</p>}
          </Field>
          {productCode && Number(leadValue) >= 0 && PRODUCT_CODES.find((product) => product.code === productCode) && <p className="self-end text-sm text-brand-300">Tentative Brokerage: {formatAmount(calculateBrokerageCommission(Number(leadValue), PRODUCT_CODES.find((product) => product.code === productCode)), leadCurrency || 'MVR')} ({PRODUCT_CODES.find((product) => product.code === productCode)?.standardBrokerageRatePct ?? 0}%)</p>}
          {leadCurrency === 'USD' && (
            <>
              <Field label="Exchange rate (MVR per USD)">
                <input className={inputClass(fieldErrors.exchangeRate)} name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} aria-invalid={Boolean(fieldErrors.exchangeRate)} />
                {fieldErrors.exchangeRate && <p className="mt-1 text-xs text-red-400">{fieldErrors.exchangeRate}</p>}
              </Field>
              {Number(leadValue) > 0 && Number(exchangeRate) > 0 && <p className="self-end text-sm text-muted">MVR equivalent: {formatAmount(toMvr(Number(leadValue), 'USD', Number(exchangeRate)), 'MVR')}</p>}
            </>
          )}
          <Field label="Owner">
            <select className={inputClass(fieldErrors.ownerId)} required value={ownerId} onChange={(event) => {
              const nextOwnerId = event.target.value;
              setOwnerId(nextOwnerId);
              const nextOwner = staffOptions.find((candidate) => candidate.id === nextOwnerId);
              if (nextOwner) setPersonName(nextOwner.name);
            }} aria-invalid={Boolean(fieldErrors.ownerId)}>
              <option value="">Select owner</option>
              {staffOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.id === user.id ? ' (You)' : ''}</option>)}
            </select>
            {fieldErrors.ownerId && <p className="mt-1 text-xs text-red-400">{fieldErrors.ownerId}</p>}
          </Field>
          <Field label="Expected Close Date">
            <DateInput name="closeDate" required value={closeDate} onIsoChange={setCloseDate} aria-label="Expected close date" className={inputClass(fieldErrors.closeDate)} />
            {fieldErrors.closeDate && <p className="mt-1 text-xs text-red-400">{fieldErrors.closeDate}</p>}
          </Field>
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
        <form id="new-organization-form" onSubmit={createOrganization} className="space-y-3">
          <p className="text-xs text-warm">This quick-created company will be tagged “{INCOMPLETE_COMPANY_TAG}” until its remaining profile details are completed.</p>
          <Field label="Organization name *"><input className="input" name="name" value={organizationQuery} onChange={(event) => setOrganizationQuery(event.target.value)} required autoFocus /></Field>
          <Field label="Primary contact name *"><input className="input" name="contactName" value={organizationContactName} onChange={(event) => setOrganizationContactName(event.target.value)} required /></Field>
          <Field label="Contact email *"><input className="input" type="email" name="contactEmail" value={organizationContactEmail} onChange={(event) => setOrganizationContactEmail(event.target.value)} required /></Field>
          <Field label="Contact phone *"><input className="input" type="tel" name="contactPhone" value={organizationContactPhone} onChange={(event) => setOrganizationContactPhone(event.target.value)} required /></Field>
        </form>
      </Modal>

      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Leads" size="sm" footer={<><button type="button" className="btn-ghost" onClick={() => { setTemperatureFilter(''); setStageFilter(''); setOwnerFilter(''); setInsuranceClassFilter(''); setStatusFilter(''); setLeadIdFilter(''); }}>Clear</button><button type="button" className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button></>}>
        <div className="space-y-3">
          <Field label="Funnel stage"><select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{LEAD_FUNNEL_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></Field>
          <Field label="Temperature"><select className="input" value={temperatureFilter} onChange={(event) => setTemperatureFilter(event.target.value)}><option value="">All temperatures</option><option>HOT</option><option>WARM</option><option>COLD</option></select></Field>
          <Field label="Owner"><select className="input" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">All owners</option>{staffOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></Field>
          <Field label="Line of business"><select className="input" value={insuranceClassFilter} onChange={(event) => setInsuranceClassFilter(event.target.value)}><option value="">All lines</option>{[...new Set(products.map((product) => product.category))].map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
          <Field label="Status"><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="TO-DO">To do</option><option value="IN-PROGRESS">In progress</option><option value="BACKLOG">Backlog</option><option value="COMPLETED">Completed</option></select></Field>
        </div>
      </Modal>
      <Modal
        open={Boolean(pendingLeadDeletion)}
        onClose={() => setPendingLeadDeletion(null)}
        title="Delete lead?"
        subtitle={`Delete “${pendingLeadDeletion?.title ?? pendingLeadDeletion?.client ?? ''}”? This action cannot be undone.`}
        size="sm"
        footer={<><button type="button" className="btn-ghost" onClick={() => setPendingLeadDeletion(null)}>Cancel</button><button type="button" className="btn-primary !bg-hot-600" onClick={confirmDeleteLead}>Delete Lead</button></>}
      >
        <p className="text-sm text-muted">This lead will be permanently removed from the funnel.</p>
      </Modal>
      {formError && (newLeadOpen || newOrganizationOpen) && (
        <div role="alert" aria-live="assertive" className="fixed right-4 top-4 z-[100] flex max-w-sm items-start gap-3 rounded-xl border border-red-500/50 bg-ink-900 px-4 py-3 text-sm text-red-300 shadow-2xl">
          <p className="flex-1">{formError}</p>
          <button type="button" onClick={() => setFormError('')} className="rounded p-0.5 text-red-300 hover:bg-red-500/10 hover:text-white" aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function inputClass(error?: string) {
  return error ? 'input border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'input';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}

function SectionHeading({ title }: { title: string }) {
  return <div className="sm:col-span-2 border-b border-ink-700 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-brand-300">{title}</div>;
}
