import { useState, type FormEvent } from 'react';
import { INSURERS, PRODUCT_CODES } from '../data/catalogs';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import {
  Phone, Mail, MapPin, Calendar, FileText, MessageSquare, Upload,
  Building2, Briefcase, ShieldCheck, Plus, Search, X,
} from 'lucide-react';
import type { Activity, Client } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';

const activityIcon = {
  call: Phone, meeting: Calendar, email: Mail, upload: Upload, note: MessageSquare, quote: FileText,
};

export default function ClientsPage() {
  const { clients, setClients, activities, setActivities, user, users } = useApp();
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteCurrency, setQuoteCurrency] = useState<Currency | ''>('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteExchangeRate, setQuoteExchangeRate] = useState('');
  const selected = clients.find((c) => c.id === selectedId) ?? clients[0];
  const clientActivities = activities.filter((a) => a.clientId === selected?.id);
  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;
  const owner = selected && users.find((u) => u.id === selected.ownerId);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.tin.toLowerCase().includes(query.toLowerCase())
  );

  const createClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const productCode = String(data.get('productCode'));
    const product = PRODUCT_CODES.find((item) => item.code === productCode);
    const client: Client = {
      id: `C-${Date.now()}`,
      name: String(data.get('name')).trim(),
      tin: String(data.get('tin')).trim(),
      country: String(data.get('country')).trim(),
      phone: String(data.get('phone')).trim(),
      email: String(data.get('email')).trim(),
      address: String(data.get('address')).trim(),
      sumInsured: Number(data.get('sumInsured')),
      premium: Number(data.get('premium')),
      expiry: String(data.get('expiry')),
      insurer: String(data.get('insurer')).trim(),
      productCode,
      class: product?.category ?? 'Miscellaneous',
      ownerId: user.id,
      tags: [],
    };
    setClients([client, ...clients]);
    setSelectedId(client.id);
    setClientOpen(false);
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
    const activity: Activity = {
      id: `a-${Date.now()}`,
      clientId: selected.id,
      type,
      title: String(data.get('title')).trim(),
      description: type === 'quote'
        ? `Insurer: ${String(data.get('insurer'))}; ${quoteSummary} ${description}`
        : description,
      date: new Date().toLocaleString('sv-SE').slice(0, 16),
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
          <button className="btn-primary w-full mt-2 !py-2" onClick={() => setClientOpen(true)}><Plus size={14} /> Add Client</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-3 border-b border-ink-700/50 transition ${
                selectedId === c.id ? 'bg-brand-500/10 border-l-2 border-l-brand-400' : 'hover:bg-ink-750/40'
              }`}
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
                {c.tags.slice(0, 1).map((t) => (
                  <Badge key={t} variant="muted">{t}</Badge>
                ))}
              </div>
            </button>
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
                  <Badge variant="muted">{productName(selected.productCode)}</Badge>
                  {selected.tags.map((t) => <Badge key={t} variant="win">{t}</Badge>)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost !py-2" onClick={() => { setQuoteCurrency(''); setQuoteAmount(''); setQuoteExchangeRate(''); setQuoteOpen(true); }}><FileText size={14} /> New Quote</button>
              <button className="btn-primary !py-2" onClick={() => setActivityOpen(true)}><Plus size={14} /> Log Activity</button>
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
                <InfoRow icon={Briefcase} label="Account Owner" value={owner?.name ?? '—'} />
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Policy Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Sum Insured" value={`MVR ${selected.sumInsured.toLocaleString()}`} />
                <Metric label="Premium" value={`MVR ${selected.premium.toLocaleString()}`} />
                <Metric label="Expiry" value={new Date(selected.expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
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
                        <div className="text-[10px] text-muted">{a.date}</div>
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
      </div> : <div className="glass rounded-2xl flex items-center justify-center text-muted">No clients found.</div>}

            <Modal open={clientOpen} onClose={() => setClientOpen(false)} title="Add Client" subtitle="Create a client record." footer={<><button type="button" className="btn-ghost" onClick={() => setClientOpen(false)}><X size={14} /> Cancel</button><button type="submit" form="new-client-form" className="btn-primary"><Plus size={14} /> Add Client</button></>}>
              <form id="new-client-form" onSubmit={createClient} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Client name"><input className="input" name="name" required /></Field>
                <Field label="TIN"><input className="input" name="tin" required /></Field>
                <Field label="Country"><input className="input" name="country" required /></Field>
                <Field label="Phone"><input className="input" name="phone" type="tel" /></Field>
                <Field label="Email"><input className="input" name="email" type="email" /></Field>
                <Field label="Address"><input className="input" name="address" /></Field>
                <Field label="Product"><select className="input" name="productCode" required defaultValue=""><option value="">Select product</option>{PRODUCT_CODES.map((product) => <option key={product.code} value={product.code}>{product.code} · {product.name}</option>)}</select></Field>
                <Field label="Insurer"><select className="input" name="insurer" required defaultValue=""><option value="">Select insurer</option>{INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></Field>
                <Field label="Expiry"><input className="input" name="expiry" type="date" required /></Field>
                <Field label="Sum Insured (MVR)"><input className="input" name="sumInsured" type="number" min="0" step="0.01" required /></Field>
                <Field label="Premium (MVR)"><input className="input" name="premium" type="number" min="0" step="0.01" required /></Field>
              </form>
            </Modal>
            <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Log Activity" subtitle={selected?.name} footer={<><button type="button" className="btn-ghost" onClick={() => setActivityOpen(false)}>Cancel</button><button type="submit" form="new-activity-form" className="btn-primary">Save Activity</button></>}>
              <form id="new-activity-form" onSubmit={(event) => addActivity(event, (new FormData(event.currentTarget).get('type') as Activity['type']))} className="space-y-3">
                <Field label="Activity type"><select className="input" name="type"><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="note">Note</option><option value="upload">Upload</option></select></Field>
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
