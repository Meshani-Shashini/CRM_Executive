import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, ShieldCheck, X, Zap } from 'lucide-react';
import Modal from '../ui/Modal';
import { useApp } from '../../store/AppContext';
import {
  CUSTOMER_LOOKUP_DEFAULTS,
  type CustomerLookupKey,
  type CustomerLookups,
} from '../../data/customerLookups';
import type { Client, InsuredEntityDetails } from '../../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../../utils/currency';
import { formatDate } from '../../utils/date';

const TARGET_LINES = [
  'Marine Hull',
  'Marine Cargo',
  'Property / IAR',
  'Fire',
  'Group Health',
  'Motor',
  'Engineering',
  'Liability',
  'Bonds',
  'Other',
];

const IDENTIFICATION_TYPES = ['Maldivian NID', 'Work Permit', 'Passport'];
const PEP_STATUSES = ['Not Declared', 'No Match / Cleared', 'Potential PEP Match', 'Sanctions Review Required'];

interface NewCustomerAccountModalProps {
  onClose: () => void;
  onCreated: (clientId: string) => void;
}

type LookupValues = Record<CustomerLookupKey, string>;

function emptyLookupValues(): LookupValues {
  return Object.fromEntries(
    Object.keys(CUSTOMER_LOOKUP_DEFAULTS).map((key) => [key, '']),
  ) as LookupValues;
}

export default function NewCustomerAccountModal({ onClose, onCreated }: NewCustomerAccountModalProps) {
  const { user, users, setClients, customerLookups, setCustomerLookups } = useApp();
  const [lookupValues, setLookupValues] = useState<LookupValues>(emptyLookupValues);
  const [quickAddKey, setQuickAddKey] = useState<CustomerLookupKey | null>(null);
  const [quickAddValue, setQuickAddValue] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [targetPremium, setTargetPremium] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (quickAddKey) {
        setQuickAddKey(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, quickAddKey]);

  const assignedUsers = useMemo(() => {
    const options = users.filter((candidate) => candidate.role === 'admin' || candidate.role === 'sales');
    if (
      (user.role === 'admin' || user.role === 'sales')
      && user.id
      && !options.some((candidate) => candidate.id === user.id)
    ) options.push(user);
    return options;
  }, [user, users]);

  const accountHandlerOptions = useMemo(
    () => [...new Set([...customerLookups.accountHandlers, ...assignedUsers.map((candidate) => candidate.name)])],
    [assignedUsers, customerLookups.accountHandlers],
  );

  const openQuickAdd = (key: CustomerLookupKey) => {
    setQuickAddKey(key);
    setQuickAddValue(lookupValues[key]);
  };

  const saveQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quickAddKey) return;
    const value = quickAddValue.trim();
    if (!value) return;
    const currentOptions = quickAddKey === 'accountHandlers'
      ? accountHandlerOptions
      : customerLookups[quickAddKey];
    const existing = currentOptions.find((option) => option.toLowerCase() === value.toLowerCase());
    const savedValue = existing ?? value;

    if (!existing) {
      setCustomerLookups((current) => ({
        ...current,
        [quickAddKey]: [...current[quickAddKey], value],
      }));
    }
    setLookupValues((current) => ({ ...current, [quickAddKey]: savedValue }));
    setQuickAddKey(null);
    setQuickAddValue('');
  };

  const saveCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const isDraft = submitter?.value === 'draft';
    if (!isDraft && !form.reportValidity()) return;

    const data = new FormData(form);
    const optionsByKey: CustomerLookups = {
      ...customerLookups,
      accountHandlers: accountHandlerOptions,
    };
    const unregisteredLookup = (Object.keys(lookupValues) as CustomerLookupKey[])
      .find((key) => lookupValues[key] && !optionsByKey[key].some(
        (option) => option.toLowerCase() === lookupValues[key].toLowerCase(),
      ));
    if (unregisteredLookup) {
      setQuickAddKey(unregisteredLookup);
      setQuickAddValue(lookupValues[unregisteredLookup]);
      return;
    }
    const legalEntityName = String(data.get('legalEntityName') ?? '').trim();
    const tradeName = String(data.get('tradeName') ?? '').trim();
    const primaryName = String(data.get('stakeholderName') ?? '').trim();
    const email = String(data.get('stakeholderEmail') ?? '').trim();
    const amount = Number(data.get('targetPremium') || 0);
    const enteredRate = currency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    const rate = enteredRate && Number.isFinite(enteredRate) && enteredRate > 0 ? enteredRate : undefined;
    const premiumMvr = currency === 'MVR'
      ? amount
      : currency === 'USD' && rate
        ? toMvr(amount, 'USD', rate)
        : 0;
    const name = legalEntityName || tradeName || `Draft Customer ${formatDate(new Date())}`;
    const targetLines = data.getAll('targetLines').map(String);
    const companyTin = String(data.get('miraTin') ?? '').trim();
    const phone = String(data.get('stakeholderPhone') ?? '').trim();
    const postalBilling = String(data.get('postalBilling') ?? '').trim();
    const assignedTo = String(data.get('actionAssignedTo') ?? '');
    const actionType = String(data.get('actionType') ?? '');
    const dueDate = String(data.get('actionDueDate') ?? '');
    const actionNotes = String(data.get('actionNotes') ?? '').trim();
    const brokeragePct = Number(data.get('brokeragePct') || 0);

    if (!isDraft && (!currency || (currency === 'USD' && (!rate || !Number.isFinite(rate) || rate <= 0)))) {
      setFormError('Choose a target premium currency and enter a positive USD/MVR rate when applicable.');
      return;
    }
    if (!isDraft && (!actionType || !dueDate || !assignedTo || !actionNotes)) {
      setFormError('Complete every Mandatory Next Action field before saving the customer.');
      return;
    }
    if (
      !Number.isFinite(amount) || amount < 0 ||
      !Number.isFinite(brokeragePct) || brokeragePct < 0 || brokeragePct > 100
    ) {
      setFormError('Enter a non-negative premium and a brokerage percentage between 0 and 100.');
      return;
    }

    const details: InsuredEntityDetails = {
      entityType: lookupValues.entityTypes[0],
      industrySector: lookupValues.industrySectors[0],
      segment: lookupValues.segments[0],
      accountHandler: lookupValues.accountHandlers[0],
      branch: lookupValues.branches[0],
      legalEntityName,
      tradeName,
      companyRegNo: String(data.get('companyRegNo') ?? '').trim(),
      gstStatus: lookupValues.gstStatuses[0],
      businessType: lookupValues.businessTypes[0],
      administrativeAtoll: lookupValues.administrativeAtolls[0],
      islandLocation: lookupValues.islands[0],
      postalBilling,
      vesselMarineBase: String(data.get('vesselMarineBase') ?? '').trim(),
      primaryStakeholder: {
        fullName: primaryName,
        designation: String(data.get('stakeholderDesignation') ?? '').trim(),
        email,
        whatsappMobile: phone,
        identificationType: String(data.get('identificationType') ?? ''),
        idReferenceNo: String(data.get('idReferenceNo') ?? '').trim(),
        pepSanctionStatus: String(data.get('pepSanctionStatus') ?? ''),
      },
      targetPremium: amount,
      targetPremiumCurrency: currency,
      targetPremiumMvr: premiumMvr,
      ...(rate ? { exchangeRate: rate } : {}),
      estimatedBrokeragePct: brokeragePct,
      targetLines,
      nextAction: {
        type: actionType,
        dueDate,
        assignedTo,
        notes: actionNotes,
      },
    };
    const client: Client = {
      id: `C-${crypto.randomUUID()}`,
      name,
      tin: companyTin,
      country: 'Maldives',
      phone,
      email,
      address: postalBilling,
      sumInsured: 0,
      premium: premiumMvr,
      expiry: '',
      insurer: '',
      productCode: '',
      class: lookupValues.industrySectors[0] || 'Miscellaneous',
      ownerId: user.id,
      tags: targetLines,
      accountStatus: isDraft ? 'draft' : 'active',
      insuredEntity: details,
    };

    setClients((current) => [client, ...current]);
    onCreated(client.id);
  };

  const lookupField = (
    key: CustomerLookupKey,
    label: string,
    options = customerLookups[key],
    required = false,
  ) => (
    <LookupField
      name={key}
      label={label}
      options={options}
      value={lookupValues[key]}
      required={required}
      onChange={(value) => setLookupValues((current) => ({ ...current, [key]: value }))}
      onAddNew={() => openQuickAdd(key)}
    />
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="⚡ NEW CUSTOMER ACCOUNT (INSURED ENTITY)"
        subtitle="Create an insured entity and its initial brokerage follow-up."
        size="xl"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={onClose}><X size={14} /> Cancel</button>
            <button type="submit" form="new-customer-account-form" name="intent" value="draft" className="btn-ghost">Save Draft</button>
            <button type="submit" form="new-customer-account-form" name="intent" value="active" className="btn-primary"><Zap size={14} /> Save Customer</button>
          </>
        }
      >
        <form id="new-customer-account-form" noValidate onSubmit={saveCustomer} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-600 bg-ink-900/50 p-3">
            <span className="text-xs text-muted">Brokerage customer onboarding</span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost !py-1.5" onClick={onClose} title="Close this form (Escape)">[ESC]</button>
              <button
                type="button"
                className="btn-ghost !py-1.5"
                onClick={() => setVerificationNotice('MIRA / NID verification is not connected in this environment. Details will be saved for manual verification.')}
              >
                <span>[</span><Zap size={14} /> Verify MIRA / NID<span>]</span>
              </button>
            </div>
          </div>
          {verificationNotice && <p role="status" className="rounded-lg border border-warm/30 bg-warm/5 p-3 text-xs text-warm">{verificationNotice}</p>}

          <Section title="Customer Classification & Market Segmentation">
            {lookupField('entityTypes', 'Entity Type', undefined, true)}
            {lookupField('industrySectors', 'Industry Sector', undefined, true)}
            {lookupField('segments', 'Segment', undefined, true)}
            {lookupField('accountHandlers', 'Account Handler', accountHandlerOptions, true)}
            {lookupField('branches', 'Branch', undefined, true)}
          </Section>

          <Section title="Entity Identification & MIRA Compliance">
            <Field label="Legal Entity Name *">
              <div className="flex gap-2">
                <input className="input min-w-0 flex-1" name="legalEntityName" required maxLength={255} />
                <button
                  type="button"
                  className="btn-ghost shrink-0 !px-2"
                  onClick={() => setVerificationNotice('MIRA entity lookup is not connected. Confirm the legal name and TIN manually before saving.')}
                >
                  [<Search size={14} /> MIRA Check]
                </button>
              </div>
            </Field>
            <Field label="Trade Name (DBA)"><input className="input" name="tradeName" /></Field>
            <Field label="Company Reg No"><input className="input" name="companyRegNo" /></Field>
            <Field label="MIRA TIN"><input className="input" name="miraTin" /></Field>
            {lookupField('gstStatuses', 'GST Status')}
            {lookupField('businessTypes', 'Business Type')}
          </Section>

          <Section title="Geographic & Risk Location (Maldives Hierarchy)">
            {lookupField('administrativeAtolls', 'Administrative Atoll')}
            {lookupField('islands', 'Island / Location')}
            <Field label="Postal / Billing"><input className="input" name="postalBilling" /></Field>
            <Field label="Vessel / Marine Base"><input className="input" name="vesselMarineBase" /></Field>
          </Section>

          <Section title="Primary Stakeholder / Risk Manager">
            <Field label="Full Name"><input className="input" name="stakeholderName" /></Field>
            <Field label="Designation"><input className="input" name="stakeholderDesignation" /></Field>
            <Field label="Email"><input className="input" name="stakeholderEmail" type="email" /></Field>
            <Field label="WhatsApp / Mobile"><input className="input" name="stakeholderPhone" type="tel" /></Field>
            <Field label="Identification Type">
              <select className="input" name="identificationType" defaultValue="">
                <option value="">Select identification type</option>
                {IDENTIFICATION_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="ID Reference No"><input className="input" name="idReferenceNo" /></Field>
            <Field label="PEP / Sanction Status">
              <select className="input" name="pepSanctionStatus" defaultValue="">
                <option value="">Select status</option>
                {PEP_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/40 px-3 py-2 text-xs text-muted">
              <ShieldCheck size={15} /> Status is recorded as provided; no screening provider is connected.
            </div>
          </Section>

          <Section title="Brokerage Profile & Portfolio Estimates">
            <Field label="Target Premium Currency">
              <div className="flex gap-2">
                {(['USD', 'MVR'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={currency === option}
                    onClick={() => {
                      setCurrency(option);
                      setTargetPremium('');
                      setExchangeRate(option === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : '');
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm ${currency === option ? 'border-brand-400 bg-brand-500/15 text-white' : 'border-ink-600 text-muted'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`Target Premium${currency ? ` (${currency})` : ''}`}>
              <input className="input" name="targetPremium" type="number" min="0" step="0.01" value={targetPremium} onChange={(event) => setTargetPremium(event.target.value)} />
            </Field>
            <Field label="Estimated Brokerage %"><input className="input" name="brokeragePct" type="number" min="0" max="100" step="0.01" /></Field>
            {currency === 'USD' && (
              <Field label="Exchange Rate (MVR per USD)">
                <input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
              </Field>
            )}
            {currency && Number(targetPremium) > 0 && (
              <p className="self-end text-sm text-muted">
                Estimated MVR equivalent: {formatAmount(toMvr(Number(targetPremium), currency, Number(exchangeRate)), 'MVR')}
              </p>
            )}
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-xs text-muted">Target Lines</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TARGET_LINES.map((line) => (
                  <label key={line} className="flex items-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs text-white">
                    <input type="checkbox" name="targetLines" value={line} className="accent-brand-400" /> {line}
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title="Mandatory Next Action">
            <Field label="Action Type *">
              <select className="input" name="actionType" required defaultValue="">
                <option value="">Select action</option>
                {['Call', 'Meeting', 'Email', 'Site Visit', 'Document Collection', 'Needs Analysis'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Due Date *"><input className="input" name="actionDueDate" type="date" required /></Field>
            <Field label="Assigned To *">
              <select className="input" name="actionAssignedTo" required defaultValue="">
                <option value="">Select assignee</option>
                {assignedUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </Field>
            <Field label="Action Notes *"><textarea className="input min-h-20" name="actionNotes" required /></Field>
          </Section>
          {formError && <p role="alert" className="text-sm text-hot">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={Boolean(quickAddKey)}
        onClose={() => setQuickAddKey(null)}
        title={`Add New ${quickAddKey ? lookupLabel(quickAddKey) : 'Option'}`}
        subtitle="This option will be saved for your brokerage and available in future forms."
        size="sm"
        layer="overlay"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setQuickAddKey(null)}>Cancel</button>
            <button type="submit" form="add-customer-lookup-form" className="btn-primary"><Plus size={14} /> Save Option</button>
          </>
        }
      >
        <form id="add-customer-lookup-form" onSubmit={saveQuickAdd}>
          <Field label={`${quickAddKey ? lookupLabel(quickAddKey) : 'Option'} name`}>
            <input className="input" autoFocus required maxLength={120} value={quickAddValue} onChange={(event) => setQuickAddValue(event.target.value)} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

function lookupLabel(key: CustomerLookupKey) {
  const labels: Record<CustomerLookupKey, string> = {
    entityTypes: 'Entity Type',
    industrySectors: 'Industry Sector',
    segments: 'Segment',
    accountHandlers: 'Account Handler',
    salesPersons: 'Sales Person',
    branches: 'Branch',
    gstStatuses: 'GST Status',
    businessTypes: 'Business Type',
    administrativeAtolls: 'Administrative Atoll',
    islands: 'Island / Location',
  };
  return labels[key];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="border-b border-ink-600 pb-2 text-sm font-semibold text-white">{title}</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><div className="mb-1.5 text-xs text-muted">{label}</div>{children}</label>;
}

function LookupField({
  name, label, options, value, required, onChange, onAddNew,
}: {
  name: CustomerLookupKey;
  label: string;
  options: string[];
  value: string;
  required: boolean;
  onChange: (value: string) => void;
  onAddNew: () => void;
}) {
  const listId = `customer-lookup-${name}`;
  return (
    <Field label={`${label}${required ? ' *' : ''}`}>
      <div className="space-y-1.5">
        <input
          className="input"
          name={`lookup-${name}`}
          list={listId}
          value={value}
          required={required}
          maxLength={120}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
        />
        <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist>
        <button type="button" className="text-xs text-brand-300 hover:text-brand-200" onClick={onAddNew}>
          + Add New {label}
        </button>
      </div>
    </Field>
  );
}
