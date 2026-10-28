import { useState, type FormEvent } from 'react';
import { INSURERS, PRODUCT_CODES } from '../data/catalogs';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { supabase } from '../lib/supabase';
import {
  Phone, Mail, MapPin, Calendar, FileText, MessageSquare, Upload,
  Building2, Briefcase, ShieldCheck, Plus, Search, Pencil, Trash2, CheckCircle2,
} from 'lucide-react';
import type { Activity, Client } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';
import { formatDate } from '../utils/date';
import DateInput from '../components/ui/DateInput';
import { hasCompleteClientProfile, INCOMPLETE_COMPANY_TAG } from '../utils/customerProfile';

const activityIcon: Record<Activity['type'], typeof Phone> = {
  call: Phone, meeting: Calendar, email: Mail, upload: Upload, note: MessageSquare, quote: FileText, task: CheckCircle2,
};

export default function ClientsPage() {
  const { clients, setClients, leads, deals, invoices, activities, setActivities, user, users } = useApp();
  const [selectedId, setSelectedId] = useState('');
  const [portalClientId, setPortalClientId] = useState(user.clientId ?? '');
  const [query, setQuery] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<Client | null>(null);
  const [isPortalEdit, setIsPortalEdit] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteCurrency, setQuoteCurrency] = useState<Currency | ''>('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteExchangeRate, setQuoteExchangeRate] = useState('');
  const visibleClients = user.role === 'client'
    ? clients.filter((client) => Boolean(portalClientId) && client.id === portalClientId)
    : clients;
  const selected = visibleClients.find((c) => c.id === selectedId) ?? visibleClients[0];
  const clientActivities = activities.filter((a) => a.clientId === selected?.id);
  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;
  const owner = selected && users.find((u) => u.id === selected.ownerId);

  const filtered = visibleClients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.tin.toLowerCase().includes(query.toLowerCase())
  );

  const deleteClient = (client: Client) => {
    if (user.role !== 'admin') return;
    const linkedLeads = leads.filter((lead) => (lead.clientId === client.id || lead.client.trim().toLowerCase() === client.name.trim().toLowerCase()) && lead.status !== 'COMPLETED');
    const linkedDeals = deals.filter((deal) => {
      const matchesClient = deal.clientId === client.id || deal.client.trim().toLowerCase() === client.name.trim().toLowerCase();
      const stage = deal.stage.trim().toLowerCase();
      const isClosed = deal.disposition === 'won' || deal.disposition === 'lost'
        || /won|bound|renewed|policy issued|lost|declined/.test(stage);
      return matchesClient && !isClosed;
    });
    const linkedInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
    if (linkedLeads.length || linkedDeals.length || linkedInvoices.length) {
      window.alert(`Cannot delete "${client.name}" because it has ${linkedLeads.length + linkedDeals.length + linkedInvoices.length} associated record(s). Reassign or delete the linked Leads, Deals, and Invoices first.`);
      return;
    }
    setPendingDeletion(client);
  };

  const confirmDeleteClient = () => {
    if (!pendingDeletion) return;
    const clientId = pendingDeletion.id;
    setClients((current) => current.filter((item) => item.id !== clientId));
    if (selected?.id === clientId) setSelectedId(visibleClients.find((item) => item.id !== clientId)?.id ?? '');
    setPendingDeletion(null);
  };

  const saveClientProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingClient) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const tin = String(data.get('tin') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const address = String(data.get('address') ?? '').trim();
    const country = String(data.get('country') ?? editingClient.country).trim();
    const contactPerson = String(data.get('contactPerson') ?? '').trim();
    const read = (name: string, fallback = '') => String(data.get(name) ?? fallback).trim();
    const readNumber = (name: string, fallback: number) => {
      const value = Number(data.get(name));
      return Number.isFinite(value) ? value : fallback;
    };
    setProfileError('');

    if (isPortalEdit) {
      try {
        const { error } = await supabase.rpc('update_own_client_contact', {
          p_client_id: editingClient.id,
          p_phone: phone,
          p_email: email,
          p_address: address,
          p_contact_person: contactPerson,
        });
        if (error) throw error;
      } catch (error) {
        console.error('Could not update client portal contact details.', error);
        setProfileError(`Could not save profile: ${error instanceof Error ? error.message : 'Supabase request failed.'}`);
        return;
      }
      setPortalClientId(editingClient.id);
      setClients((current) => current.map((client) => client.id === editingClient.id
        ? {
          ...client,
          phone,
          email,
          address,
          contactPerson,
          ...(client.insuredEntity ? {
            insuredEntity: {
              ...client.insuredEntity,
              primaryStakeholder: {
                ...client.insuredEntity.primaryStakeholder,
                fullName: contactPerson,
                email,
                whatsappMobile: phone,
              },
            },
          } : {}),
        }
        : client));
    } else {
      const legalEntityName = name;
      const existingDetails = editingClient.insuredEntity;
      const targetPremiumCurrency = read('targetPremiumCurrency', existingDetails?.targetPremiumCurrency ?? '') as 'MVR' | 'USD' | '';
      const targetPremium = readNumber('targetPremium', existingDetails?.targetPremium ?? 0);
      const exchangeRate = readNumber('exchangeRate', existingDetails?.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE);
      const insuredEntity = existingDetails ? {
        ...existingDetails,
        entityType: read('entityType', existingDetails.entityType),
        industrySector: read('industrySector', existingDetails.industrySector),
        segment: read('segment', existingDetails.segment),
        accountHandler: read('accountHandler', existingDetails.accountHandler),
        branch: read('branch', existingDetails.branch),
        legalEntityName,
        tradeName: read('tradeName', existingDetails.tradeName),
        companyRegNo: read('companyRegNo', existingDetails.companyRegNo),
        gstStatus: read('gstStatus', existingDetails.gstStatus),
        businessType: read('businessType', existingDetails.businessType),
        administrativeAtoll: read('administrativeAtoll', existingDetails.administrativeAtoll),
        islandLocation: read('islandLocation', existingDetails.islandLocation),
        postalBilling: read('postalBilling', existingDetails.postalBilling),
        vesselMarineBase: read('vesselMarineBase', existingDetails.vesselMarineBase),
        primaryStakeholder: {
          ...existingDetails.primaryStakeholder,
          fullName: contactPerson,
          designation: read('stakeholderDesignation', existingDetails.primaryStakeholder.designation),
          email,
          whatsappMobile: phone,
          identificationType: read('identificationType', existingDetails.primaryStakeholder.identificationType),
          idReferenceNo: read('idReferenceNo', existingDetails.primaryStakeholder.idReferenceNo),
          pepSanctionStatus: read('pepSanctionStatus', existingDetails.primaryStakeholder.pepSanctionStatus),
        },
        targetPremium,
        targetPremiumCurrency,
        targetPremiumMvr: targetPremiumCurrency === 'USD'
          ? toMvr(targetPremium, 'USD', exchangeRate)
          : targetPremiumCurrency === 'MVR' ? targetPremium : 0,
        exchangeRate: targetPremiumCurrency === 'USD' ? exchangeRate : undefined,
        estimatedBrokeragePct: readNumber('estimatedBrokeragePct', existingDetails.estimatedBrokeragePct),
        targetLines: read('targetLines', existingDetails.targetLines.join(',')).split(',').map((value) => value.trim()).filter(Boolean),
        nextAction: {
          type: read('nextActionType', existingDetails.nextAction.type),
          dueDate: read('nextActionDueDate', existingDetails.nextAction.dueDate),
          assignedTo: read('nextActionAssignedTo', existingDetails.nextAction.assignedTo),
          notes: read('nextActionNotes', existingDetails.nextAction.notes),
        },
      } : undefined;
      setClients((current) => current.map((client) => client.id === editingClient.id
        ? {
          ...client,
          name: legalEntityName,
          tin,
          country,
          phone,
          email,
          address,
          sumInsured: readNumber('sumInsured', editingClient.sumInsured),
          premium: readNumber('premium', editingClient.premium),
          expiry: read('expiry', editingClient.expiry),
          insurer: read('insurer', editingClient.insurer),
          productCode: read('productCode', editingClient.productCode),
          class: read('class', editingClient.class),
          tags: (hasCompleteClientProfile({
            ...editingClient,
            name: legalEntityName,
            tin,
            country,
            phone,
            email,
            address,
            class: read('class', editingClient.class),
            productCode: read('productCode', editingClient.productCode),
            contactPerson,
          })
            ? read('tags', editingClient.tags.filter((tag) => tag !== INCOMPLETE_COMPANY_TAG).join(','))
              .split(',').map((value) => value.trim()).filter((value) => value && value !== INCOMPLETE_COMPANY_TAG)
            : [...new Set([
              ...read('tags', editingClient.tags.join(',')).split(',').map((value) => value.trim()).filter(Boolean),
              INCOMPLETE_COMPANY_TAG,
            ])]),
          accountStatus: hasCompleteClientProfile({
            ...editingClient,
            name: legalEntityName,
            tin,
            country,
            phone,
            email,
            address,
            class: read('class', editingClient.class),
            productCode: read('productCode', editingClient.productCode),
            contactPerson,
          }) ? 'active' : read('accountStatus', editingClient.accountStatus ?? 'draft') as Client['accountStatus'],
          contactPerson,
          ...(insuredEntity ? { insuredEntity } : {}),
        }
        : client));
    }
    setEditingClient(null);
  };

  const addActivity = (event: FormEvent<HTMLFormElement>, type: Activity['type']) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const amount = type === 'quote' ? Number(data.get('premium')) : undefined;
    const currency = type === 'quote' ? String(data.get('currency')) as Currency : undefined;
    const exchangeRate = currency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const quoteSummary = currency === 'USD'
      ? `Premium ${formatAmount(amount ?? 0, 'USD')} (equivalent ${formatAmount(toMvr(amount ?? 0, 'USD', exchangeRate), 'MVR')} at ${exchangeRate} MVR per USD).`
      : currency === 'MVR' ? `Premium ${formatAmount(amount ?? 0, 'MVR')}.` : '';
    const now = new Date().toISOString();
    const activity: Activity = {
      id: `a-${Date.now()}`,
      clientId: selected.id,
      type,
      title: String(data.get('title')).trim(),
      description: type === 'quote'
        ? `Insurer: ${String(data.get('insurer'))}; ${quoteSummary} ${description}`
        : description,
      date: now,
      createdAt: now,
      userId: user.id,
      ...(type === 'quote' && currency ? {
        quoteAmount: amount,
        quoteCurrency: currency,
        ...(exchangeRate ? { quoteExchangeRate: exchangeRate } : {}),
      } : {}),
    };
    setActivities([activity, ...activities]);
    if (type === 'quote') setQuoteOpen(false);
    else setActivityOpen(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-8rem)]">
      {/* List */}
      <div className="glass rounded-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-ink-600">
          <div className="flex items-center gap-2 bg-ink-900/80 border border-ink-600 rounded-lg px-3 py-2">
            <Search size={14} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="bg-transparent text-sm text-white outline-none flex-1 placeholder:text-muted/70"
            />
          </div>
          {(user.role === 'admin' || user.role === 'sales') && (
            <a className="btn-primary w-full mt-2 !py-2 no-underline" href="#/leads"><Plus size={14} /> Add through Lead</a>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`border-b border-ink-700/50 ${
                selectedId === c.id || (!selectedId && selected?.id === c.id)
                  ? 'bg-brand-500/10 border-l-2 border-l-brand-400'
                  : 'hover:bg-ink-750/40'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left px-3 pt-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-ink-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted">TIN: {c.tin}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="pill bg-brand-400/10 text-brand-400 border border-brand-400/30 !px-1.5">
                    {c.productCode}
                  </span>
                  {c.tags.filter((tag) => tag !== INCOMPLETE_COMPANY_TAG).slice(0, 1).map((t) => (
                    <Badge key={t} variant="muted">{t}</Badge>
                  ))}
                  {!hasCompleteClientProfile(c) && <Badge variant="warm">{INCOMPLETE_COMPANY_TAG}</Badge>}
                </div>
              </button>
              {user.role === 'admin' && (
                <div className="flex justify-end gap-1 px-2 pb-2">
                  <button type="button" aria-label={`Edit client ${c.name}`} title="Edit Client" className="btn-ghost !p-1.5" onClick={() => { setIsPortalEdit(false); setEditingClient(c); }}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label={`Delete client ${c.name}`} title="Delete Client" className="btn-ghost !p-1.5 text-hot" onClick={() => deleteClient(c)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      {selected ? <div className="flex flex-col gap-4 overflow-y-auto">
        {/* Header */}
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg">
                {selected.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                <div className="text-sm text-muted mt-0.5">TIN: {selected.tin} · {selected.country}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="brand" dot>{selected.class}</Badge>
                  {selected.accountStatus === 'draft' && <Badge variant="muted">Draft</Badge>}
                  <Badge variant="muted">{productName(selected.productCode)}</Badge>
                  {selected.tags.map((t) => <Badge key={t} variant="win">{t}</Badge>)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {user.role === 'admin' && (
                <>
                  <button className="btn-ghost !py-2" onClick={() => { setIsPortalEdit(false); setEditingClient(selected); }}><Pencil size={14} /> Edit Client</button>
                  <button className="btn-ghost !py-2 text-hot" onClick={() => deleteClient(selected)}><Trash2 size={14} /> Delete Client</button>
                </>
              )}
              {user.role === 'client' && (
                <button className="btn-primary !py-2" onClick={() => { setProfileError(''); setIsPortalEdit(true); setEditingClient(selected); }}>
                  <Pencil size={14} /> Edit My Profile
                </button>
              )}
              {user.role !== 'client' && (
                <>
                  <button className="btn-ghost !py-2" onClick={() => { setQuoteCurrency(''); setQuoteAmount(''); setQuoteExchangeRate(''); setQuoteOpen(true); }}><FileText size={14} /> New Quote</button>
                  <button className="btn-primary !py-2" onClick={() => setActivityOpen(true)}><Plus size={14} /> Log Activity</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Client info */}
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Building2 size={16} /> Client Information</h3>
              <div className="space-y-3 text-sm">
                <InfoRow icon={Phone} label="Phone" value={selected.phone} />
                <InfoRow icon={Mail} label="Email" value={selected.email} />
                <InfoRow icon={MapPin} label="Address" value={selected.address} />
                {(selected.contactPerson || selected.insuredEntity?.primaryStakeholder.fullName) && (
                  <InfoRow icon={Briefcase} label="Contact Person" value={selected.contactPerson || selected.insuredEntity?.primaryStakeholder.fullName || ''} />
                )}
                <InfoRow icon={Briefcase} label="Account Owner" value={owner?.name ?? '—'} />
              </div>
              {selected.contacts?.length ? <div className="mt-4 border-t border-ink-700 pt-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Company Contacts</h4>
                <div className="space-y-2">
                  {selected.contacts.map((contact) => <div key={contact.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium text-white">{contact.name}</span><Badge variant="muted">{contact.role}</Badge></div>
                    <div className="mt-1 text-xs text-muted">{contact.email} · {contact.phone}</div>
                  </div>)}
                </div>
              </div> : null}
            </div>

            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Policy Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Sum Insured" value={`MVR ${selected.sumInsured.toLocaleString()}`} />
                <Metric label="Premium" value={`MVR ${selected.premium.toLocaleString()}`} />
                <Metric
                  label="Expiry"
                  value={selected.expiry
                    ? formatDate(selected.expiry)
                    : '—'}
                />
                <Metric label="Insurer" value={selected.insurer} />
                <Metric label="Class" value={selected.class} />
                <Metric label="Product" value={`${selected.productCode} · ${productName(selected.productCode)}`} />
              </div>
            </div>
          </div>

          {/* Right: Activity timeline */}
          <div className="glass rounded-2xl p-5 flex flex-col">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Calendar size={16} /> Activity Timeline</h3>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {clientActivities.map((a: Activity, i) => {
                const Icon = activityIcon[a.type];
                return (
                  <div key={a.id} className="relative pl-8">
                    {i < activities.length - 1 && (
                      <div className="absolute left-3 top-7 bottom-[-12px] w-px bg-ink-600" />
                    )}
                    <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center">
                      <Icon size={12} className="text-brand-400" />
                    </div>
                    <div className="bg-ink-900/40 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-white">{a.title}</div>
                        <div className="text-[10px] text-muted">{formatDate(a.date)}</div>
                      </div>
                      <div className="text-xs text-muted mt-1">{a.description}</div>
                    </div>
                  </div>
                );
              })}
              {clientActivities.length === 0 && (
                <div className="text-center text-muted text-sm py-8">No activity yet</div>
              )}
            </div>
          </div>
        </div>
      </div> : <div className="glass rounded-2xl flex items-center justify-center text-muted">
        {user.role === 'client' ? 'No client account is linked to this login.' : 'No clients found.'}
      </div>}

            <Modal
              open={Boolean(editingClient)}
              onClose={() => { setEditingClient(null); setProfileError(''); }}
              title={isPortalEdit ? 'Update My Profile' : 'Edit Client'}
              subtitle={isPortalEdit ? 'Update your contact details.' : editingClient?.name}
              footer={<><button type="button" className="btn-ghost" onClick={() => { setEditingClient(null); setProfileError(''); }}>Cancel</button><button type="submit" form="edit-client-form" className="btn-primary">Save Changes</button></>}
            >
              {editingClient && (
                <form id="edit-client-form" onSubmit={saveClientProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {!isPortalEdit && <Field label="Legal name"><input className="input" name="name" required defaultValue={editingClient.insuredEntity?.legalEntityName || editingClient.name} /></Field>}
                  {!isPortalEdit && <Field label="TIN"><input className="input" name="tin" defaultValue={editingClient.tin} /></Field>}
                  <Field label="Phone *"><input className="input" name="phone" type="tel" required defaultValue={editingClient.phone} /></Field>
                  <Field label="Email"><input className="input" name="email" type="email" required defaultValue={editingClient.email} /></Field>
                  <Field label="Contact person"><input className="input" name="contactPerson" defaultValue={editingClient.contactPerson || editingClient.insuredEntity?.primaryStakeholder.fullName || ''} /></Field>
                  <Field label="Address"><textarea className="input min-h-20" name="address" defaultValue={editingClient.address} /></Field>
                  {!isPortalEdit && <>
                    <Field label="Country"><input className="input" name="country" defaultValue={editingClient.country} /></Field>
                    <Field label="Class"><input className="input" name="class" defaultValue={editingClient.class} /></Field>
                    <Field label="Product code"><input className="input" name="productCode" defaultValue={editingClient.productCode} /></Field>
                    <Field label="Insurer"><input className="input" name="insurer" defaultValue={editingClient.insurer} /></Field>
                    <Field label="Sum insured"><input className="input" name="sumInsured" type="number" min="0" step="0.01" defaultValue={editingClient.sumInsured} /></Field>
                    <Field label="Premium"><input className="input" name="premium" type="number" min="0" step="0.01" defaultValue={editingClient.premium} /></Field>
                    <Field label="Expiry"><DateInput name="expiry" defaultValue={editingClient.expiry} aria-label="Policy expiry date" /></Field>
                    <Field label="Tags (comma-separated)"><input className="input" name="tags" defaultValue={editingClient.tags.join(', ')} /></Field>
                    <Field label="Account status"><select className="input" name="accountStatus" defaultValue={editingClient.accountStatus ?? 'active'}><option value="active">Active</option><option value="draft">Draft</option></select></Field>
                    {editingClient.insuredEntity && <>
                      <Field label="Entity type"><input className="input" name="entityType" defaultValue={editingClient.insuredEntity.entityType} /></Field>
                      <Field label="Industry sector"><input className="input" name="industrySector" defaultValue={editingClient.insuredEntity.industrySector} /></Field>
                      <Field label="Segment"><input className="input" name="segment" defaultValue={editingClient.insuredEntity.segment} /></Field>
                      <Field label="Account handler"><input className="input" name="accountHandler" defaultValue={editingClient.insuredEntity.accountHandler} /></Field>
                      <Field label="Branch"><input className="input" name="branch" defaultValue={editingClient.insuredEntity.branch} /></Field>
                      <Field label="Trade name"><input className="input" name="tradeName" defaultValue={editingClient.insuredEntity.tradeName} /></Field>
                      <Field label="Company registration number"><input className="input" name="companyRegNo" defaultValue={editingClient.insuredEntity.companyRegNo} /></Field>
                      <Field label="GST status"><input className="input" name="gstStatus" defaultValue={editingClient.insuredEntity.gstStatus} /></Field>
                      <Field label="Business type"><input className="input" name="businessType" defaultValue={editingClient.insuredEntity.businessType} /></Field>
                      <Field label="Administrative atoll"><input className="input" name="administrativeAtoll" defaultValue={editingClient.insuredEntity.administrativeAtoll} /></Field>
                      <Field label="Island / location"><input className="input" name="islandLocation" defaultValue={editingClient.insuredEntity.islandLocation} /></Field>
                      <Field label="Postal / billing"><input className="input" name="postalBilling" defaultValue={editingClient.insuredEntity.postalBilling} /></Field>
                      <Field label="Vessel / marine base"><input className="input" name="vesselMarineBase" defaultValue={editingClient.insuredEntity.vesselMarineBase} /></Field>
                      <Field label="Stakeholder designation"><input className="input" name="stakeholderDesignation" defaultValue={editingClient.insuredEntity.primaryStakeholder.designation} /></Field>
                      <Field label="Stakeholder ID type"><input className="input" name="identificationType" defaultValue={editingClient.insuredEntity.primaryStakeholder.identificationType} /></Field>
                      <Field label="Stakeholder ID reference"><input className="input" name="idReferenceNo" defaultValue={editingClient.insuredEntity.primaryStakeholder.idReferenceNo} /></Field>
                      <Field label="PEP / sanctions status"><input className="input" name="pepSanctionStatus" defaultValue={editingClient.insuredEntity.primaryStakeholder.pepSanctionStatus} /></Field>
                      <Field label="Target premium"><input className="input" name="targetPremium" type="number" min="0" step="0.01" defaultValue={editingClient.insuredEntity.targetPremium} /></Field>
                      <Field label="Target premium currency"><select className="input" name="targetPremiumCurrency" defaultValue={editingClient.insuredEntity.targetPremiumCurrency}><option value="">Not set</option><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
                      <Field label="USD exchange rate (MVR per USD)"><input className="input" name="exchangeRate" type="number" min="0.000001" step="any" defaultValue={editingClient.insuredEntity.exchangeRate ?? DEFAULT_USD_TO_MVR_RATE} /></Field>
                      <Field label="Estimated brokerage (%)"><input className="input" name="estimatedBrokeragePct" type="number" min="0" max="100" step="0.01" defaultValue={editingClient.insuredEntity.estimatedBrokeragePct} /></Field>
                      <Field label="Target lines (comma-separated)"><input className="input" name="targetLines" defaultValue={editingClient.insuredEntity.targetLines.join(', ')} /></Field>
                      <Field label="Next action type"><input className="input" name="nextActionType" defaultValue={editingClient.insuredEntity.nextAction.type} /></Field>
                    <Field label="Next action due date"><DateInput name="nextActionDueDate" defaultValue={editingClient.insuredEntity.nextAction.dueDate} aria-label="Next action due date" /></Field>
                      <Field label="Next action assigned to"><input className="input" name="nextActionAssignedTo" defaultValue={editingClient.insuredEntity.nextAction.assignedTo} /></Field>
                      <Field label="Next action notes"><textarea className="input min-h-20" name="nextActionNotes" defaultValue={editingClient.insuredEntity.nextAction.notes} /></Field>
                    </>}
                  </>}
                  {isPortalEdit && <p className="sm:col-span-2 text-xs text-muted">The contact email here does not change your sign-in email.</p>}
                  {profileError && <p role="alert" className="sm:col-span-2 text-sm text-hot">{profileError}</p>}
                </form>
              )}
            </Modal>
            <Modal
              open={Boolean(pendingDeletion)}
              onClose={() => setPendingDeletion(null)}
              title="Delete company?"
              subtitle={`Delete “${pendingDeletion?.name ?? ''}”? This action cannot be undone.`}
              size="sm"
              footer={<><button type="button" className="btn-ghost" onClick={() => setPendingDeletion(null)}>Cancel</button><button type="button" className="btn-primary !bg-hot-600" onClick={confirmDeleteClient}>Delete Company</button></>}
            >
              <p className="text-sm text-muted">The company profile will be permanently removed.</p>
            </Modal>
            <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Log Activity" subtitle={selected?.name} footer={<><button type="button" className="btn-ghost" onClick={() => setActivityOpen(false)}>Cancel</button><button type="submit" form="new-activity-form" className="btn-primary">Save Activity</button></>}>
              <form id="new-activity-form" onSubmit={(event) => addActivity(event, (new FormData(event.currentTarget).get('type') as Activity['type']))} className="space-y-3">
                <Field label="Activity type"><select className="input" name="type"><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="note">Note</option><option value="task">Task</option><option value="upload">Upload</option></select></Field>
                <Field label="Title"><input className="input" name="title" required /></Field>
                <Field label="Details"><textarea className="input min-h-24" name="description" required /></Field>
              </form>
            </Modal>
            <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Create Quote" subtitle={`Prepare a quote for ${selected?.name ?? ''}.`} footer={<><button type="button" className="btn-ghost" onClick={() => setQuoteOpen(false)}>Cancel</button><button type="submit" form="new-quote-form" className="btn-primary">Save Quote</button></>}>
              <form id="new-quote-form" onSubmit={(event) => addActivity(event, 'quote')} className="space-y-3">
                <Field label="Product"><select className="input" name="title" required defaultValue=""><option value="">Select product</option>{PRODUCT_CODES.map((product) => <option key={product.code} value={`${product.name} quote`}>{product.code} · {product.name}</option>)}</select></Field>
                <Field label="Insurer"><select className="input" name="insurer" required defaultValue=""><option value="">Select insurer</option>{INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></Field>
                <Field label="Currency"><select className="input" name="currency" required value={quoteCurrency} onChange={(event) => { const currency = event.target.value as Currency | ''; setQuoteCurrency(currency); setQuoteAmount(''); setQuoteExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : ''); }}><option value="">Select currency</option><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
                <Field label={`Premium${quoteCurrency ? ` (${quoteCurrency})` : ''}`}><input className="input" name="premium" type="number" min="0" step="0.01" required value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} /></Field>
                {quoteCurrency === 'USD' && <Field label="Exchange rate (1 USD = MVR)"><input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={quoteExchangeRate} onChange={(event) => setQuoteExchangeRate(event.target.value)} /></Field>}
                {quoteCurrency === 'USD' && Number(quoteAmount) > 0 && Number(quoteExchangeRate) > 0 && <p className="text-sm text-muted">Equivalent: {formatAmount(toMvr(Number(quoteAmount), 'USD', Number(quoteExchangeRate)), 'MVR')}</p>}
                <Field label="Coverage / notes"><textarea className="input min-h-24" name="description" placeholder="Enter coverage and terms" required /></Field>
              </form>
            </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}

function InfoRow({ icon: Icon, label, value }: { icon:  typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted">{label}</div>
        <div className="text-white text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900/50 rounded-lg p-3">
      <div className="text-[11px] text-muted mb-1">{label}</div>
      <div className="text-white text-sm font-medium">{value}</div>
    </div>
  );
}
