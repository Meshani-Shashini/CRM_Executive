import { useEffect, useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import type { ProductCode } from '../types';
import type {
  ExchangeRateSetting, PayeeAccount, PriceBook, SettingsCatalogs, StrategicGoal, TeamNotice,
} from '../data/settingsCatalogs';
import type { Dispatch, SetStateAction } from 'react';

type SimpleSection = 'tags' | 'lead-sources' | 'competitors';
type RecordSection = 'price-books' | 'payee-accounts' | 'notices' | 'strategic-goals' | 'exchange-rates';
type Section = SimpleSection | RecordSection;

const simpleKeys: Record<SimpleSection, keyof SettingsCatalogs> = {
  tags: 'tags',
  'lead-sources': 'leadSources',
  competitors: 'competitors',
};

interface Props {
  section: Section;
  title: string;
  description: string;
  catalogs: SettingsCatalogs;
  setCatalogs: Dispatch<SetStateAction<SettingsCatalogs>>;
  products: ProductCode[];
  onAudit: (title: string, description: string) => void;
  onNotice: (message: string) => void;
}

export default function SettingsCatalogManager({
  section, title, description, catalogs, setCatalogs, products, onAudit, onNotice,
}: Props) {
  if (section in simpleKeys) {
    const key = simpleKeys[section as SimpleSection];
    return <SimpleListManager
      title={title}
      description={description}
      items={catalogs[key] as string[]}
      onSave={(items, action, item) => {
        setCatalogs((current) => ({ ...current, [key]: items }));
        onAudit(`Setting ${action}`, `${title} · ${item}`);
        onNotice(`${title} ${action === 'added' ? 'entry added' : action === 'updated' ? 'entry updated' : 'entry removed'}.`);
      }}
    />;
  }

  return <RecordListManager
    section={section as RecordSection}
    title={title}
    description={description}
    catalogs={catalogs}
    setCatalogs={setCatalogs}
    products={products}
    onAudit={onAudit}
    onNotice={onNotice}
  />;
}

function SimpleListManager({
  title, description, items, onSave,
}: {
  title: string;
  description: string;
  items: string[];
  onSave: (items: string[], action: 'added' | 'updated' | 'removed', item: string) => void;
}) {
  const [value, setValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = value.trim();
    if (!normalized) return;
    if (items.some((item, index) => item.toLocaleLowerCase() === normalized.toLocaleLowerCase() && index !== editingIndex)) {
      setError(`A ${title.toLocaleLowerCase()} entry with this name already exists.`);
      return;
    }
    const next = [...items];
    if (editingIndex === null) next.push(normalized);
    else next[editingIndex] = normalized;
    onSave(next, editingIndex === null ? 'added' : 'updated', normalized);
    setValue('');
    setEditingIndex(null);
    setError('');
  };

  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <header>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </header>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={save}>
        <input
          className="input flex-1"
          value={value}
          aria-label={`${editingIndex === null ? 'New' : 'Edit'} ${title.toLocaleLowerCase()} entry`}
          placeholder={`Enter ${title.toLocaleLowerCase()} name`}
          onChange={(event) => setValue(event.target.value)}
          required
        />
        <button className="btn-primary !py-1.5" type="submit">
          {editingIndex === null ? <Plus size={14} /> : <Check size={14} />}
          {editingIndex === null ? 'Add' : 'Save'}
        </button>
        {editingIndex !== null && <button className="btn-ghost !py-1.5" type="button" onClick={() => { setEditingIndex(null); setValue(''); }}>
          Cancel
        </button>}
      </form>
      {error && <p role="alert" className="text-sm text-hot">{error}</p>}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/40 p-3">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{item}</span>
              <button type="button" className="p-1.5 text-muted hover:text-white" aria-label={`Edit ${item}`}
                onClick={() => { setEditingIndex(index); setValue(item); setError(''); }}>
                <Pencil size={14} />
              </button>
              <button type="button" className="p-1.5 text-muted hover:text-hot" aria-label={`Delete ${item}`}
                onClick={() => {
                  onSave(items.filter((_, itemIndex) => itemIndex !== index), 'removed', item);
                  if (editingIndex === index) { setEditingIndex(null); setValue(''); }
                }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg border border-ink-700 bg-ink-900/40 p-4 text-sm text-muted">No entries have been added.</p>}
    </section>
  );
}

function RecordListManager({
  section, title, description, catalogs, setCatalogs, products, onAudit, onNotice,
}: Props & { section: RecordSection }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [currency, setCurrency] = useState<'MVR' | 'USD'>('MVR');
  const [overridesText, setOverridesText] = useState('');
  const [status, setStatus] = useState<TeamNotice['status']>('Draft');
  const [horizon, setHorizon] = useState<StrategicGoal['horizon']>('Quarterly');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [usdPerUnit, setUsdPerUnit] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setEditingId(null);
    setName('');
    setDetails('');
    setCurrency('MVR');
    setOverridesText('');
    setStatus('Draft');
    setHorizon('Quarterly');
    setTarget('');
    setUnit('');
    setUsdPerUnit('');
    setError('');
  };
  useEffect(() => reset(), [section]);

  const startAdd = () => {
    reset();
    setOpen(true);
  };
  const startEdit = (record: PriceBook | PayeeAccount | TeamNotice | StrategicGoal | ExchangeRateSetting) => {
    reset();
    setEditingId(record.id);
    if (section === 'price-books' && 'overrides' in record) {
      setName(record.name);
      setCurrency(record.currency);
      setOverridesText(record.overrides.map((override) => `${override.productCode} = ${override.price}`).join('\n'));
    } else if (section === 'payee-accounts' && 'accountNumber' in record) {
      setName(record.name);
      setDetails(record.accountNumber);
    } else if (section === 'notices' && 'body' in record) {
      setName(record.title);
      setDetails(record.body);
      setStatus(record.status);
    } else if (section === 'strategic-goals' && 'horizon' in record) {
      setName(record.title);
      setHorizon(record.horizon);
      setTarget(String(record.target));
      setUnit(record.unit);
    } else if (section === 'exchange-rates' && 'usdPerUnit' in record) {
      setName(record.currency);
      setUsdPerUnit(String(record.usdPerUnit));
    }
    setOpen(true);
  };

  const parsePriceOverrides = () => {
    const lines = overridesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
      const [code, rawPrice, ...extra] = line.split('=');
      const productCode = code?.trim().toUpperCase();
      const price = Number(rawPrice?.trim());
      return { productCode, price, valid: !extra.length && Boolean(productCode) && Number.isFinite(price) && price >= 0 };
    });
    const duplicateCodes = new Set(parsed.map((item) => item.productCode)).size !== parsed.length;
    const unknownCodes = parsed.filter((item) => !products.some((product) => product.code.toUpperCase() === item.productCode));
    if (parsed.some((item) => !item.valid) || duplicateCodes || unknownCodes.length) {
      setError('Enter one valid, unique product code and non-negative price per line, using CODE = PRICE.');
      return null;
    }
    return parsed.map(({ productCode, price }) => ({ productCode, price }));
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const id = editingId ?? crypto.randomUUID();
    if (section === 'price-books') {
      const overrides = parsePriceOverrides();
      if (!name.trim() || !overrides) {
        if (!name.trim()) setError('Enter a price book name.');
        return;
      }
      const book: PriceBook = { id, name: name.trim(), currency, overrides };
      setCatalogs((current) => ({
        ...current,
        priceBooks: editingId
          ? current.priceBooks.map((item) => item.id === id ? book : item)
          : [...current.priceBooks, book],
      }));
      onAudit(`Price book ${editingId ? 'updated' : 'added'}`, book.name);
    } else if (section === 'payee-accounts') {
      if (!name.trim() || !details.trim()) { setError('Enter the payee name and account number.'); return; }
      const account: PayeeAccount = { id, name: name.trim(), accountNumber: details.trim() };
      setCatalogs((current) => ({
        ...current,
        payeeAccounts: editingId
          ? current.payeeAccounts.map((item) => item.id === id ? account : item)
          : [...current.payeeAccounts, account],
      }));
      onAudit(`Payee account ${editingId ? 'updated' : 'added'}`, account.name);
    } else if (section === 'notices') {
      if (!name.trim() || !details.trim()) { setError('Enter the notice title and message.'); return; }
      const notice: TeamNotice = { id, title: name.trim(), body: details.trim(), status };
      setCatalogs((current) => ({
        ...current,
        notices: editingId
          ? current.notices.map((item) => item.id === id ? notice : item)
          : [...current.notices, notice],
      }));
      onAudit(`Team notice ${editingId ? 'updated' : 'created'}`, notice.title);
    } else if (section === 'strategic-goals') {
      const numericTarget = Number(target);
      if (!name.trim() || !Number.isFinite(numericTarget) || numericTarget <= 0 || !unit.trim()) {
        setError('Enter a goal name, a target greater than zero, and its unit.');
        return;
      }
      const goal: StrategicGoal = { id, title: name.trim(), horizon, target: numericTarget, unit: unit.trim() };
      setCatalogs((current) => ({
        ...current,
        strategicGoals: editingId
          ? current.strategicGoals.map((item) => item.id === id ? goal : item)
          : [...current.strategicGoals, goal],
      }));
      onAudit(`Strategic goal ${editingId ? 'updated' : 'added'}`, goal.title);
    } else {
      const rate = Number(usdPerUnit);
      const normalizedCurrency = name.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(normalizedCurrency) || !Number.isFinite(rate) || rate <= 0) {
        setError('Enter a three-letter currency code and a rate greater than zero.');
        return;
      }
      if (catalogs.exchangeRates.some((item) => item.currency === normalizedCurrency && item.id !== editingId)) {
        setError(`A rate for ${normalizedCurrency} already exists.`);
        return;
      }
      const exchangeRate: ExchangeRateSetting = { id, currency: normalizedCurrency, usdPerUnit: rate };
      setCatalogs((current) => ({
        ...current,
        exchangeRates: editingId
          ? current.exchangeRates.map((item) => item.id === id ? exchangeRate : item)
          : [...current.exchangeRates, exchangeRate],
      }));
      onAudit(`Exchange rate ${editingId ? 'updated' : 'added'}`, `${normalizedCurrency} · ${rate} USD per unit`);
    }
    onNotice(`${title} ${editingId ? 'updated' : 'saved'}.`);
    setOpen(false);
    reset();
  };

  const remove = (recordId: string, label: string) => {
    if (section === 'price-books') setCatalogs((current) => ({ ...current, priceBooks: current.priceBooks.filter((item) => item.id !== recordId) }));
    else if (section === 'payee-accounts') setCatalogs((current) => ({ ...current, payeeAccounts: current.payeeAccounts.filter((item) => item.id !== recordId) }));
    else if (section === 'notices') setCatalogs((current) => ({ ...current, notices: current.notices.filter((item) => item.id !== recordId) }));
    else if (section === 'strategic-goals') setCatalogs((current) => ({ ...current, strategicGoals: current.strategicGoals.filter((item) => item.id !== recordId) }));
    else setCatalogs((current) => ({ ...current, exchangeRates: current.exchangeRates.filter((item) => item.id !== recordId) }));
    onAudit(`${title} entry deleted`, label);
    onNotice(`${label} deleted.`);
  };

  const records = section === 'price-books' ? catalogs.priceBooks
    : section === 'payee-accounts' ? catalogs.payeeAccounts
      : section === 'notices' ? catalogs.notices
        : section === 'strategic-goals' ? catalogs.strategicGoals
          : catalogs.exchangeRates;

  return (
    <section className="glass rounded-2xl p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-1 text-xs text-muted">{description}</p>
        </div>
        <button type="button" className="btn-primary !py-1.5" onClick={startAdd}><Plus size={14} /> Add</button>
      </header>
      <div className="space-y-2">
        {records.map((record) => (
          <article key={record.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3">
            <div className="min-w-0 flex-1">
              {section === 'price-books' && 'overrides' in record && <>
                <p className="truncate text-sm font-medium text-white">{record.name}</p>
                <p className="text-xs text-muted">{record.currency} · {record.overrides.length} price override{record.overrides.length === 1 ? '' : 's'}</p>
              </>}
              {section === 'payee-accounts' && 'accountNumber' in record && <>
                <p className="truncate text-sm font-medium text-white">{record.name}</p>
                <p className="text-xs text-muted">{record.accountNumber}</p>
              </>}
              {section === 'notices' && 'body' in record && <>
                <p className="truncate text-sm font-medium text-white">{record.title}</p>
                <p className="truncate text-xs text-muted">{record.body}</p>
              </>}
              {section === 'strategic-goals' && 'horizon' in record && <>
                <p className="truncate text-sm font-medium text-white">{record.title}</p>
                <p className="text-xs text-muted">{record.horizon} · {record.target.toLocaleString()} {record.unit}</p>
              </>}
              {section === 'exchange-rates' && 'usdPerUnit' in record && <>
                <p className="text-sm font-medium text-white">{record.currency}</p>
                <p className="text-xs text-muted">1 {record.currency} = {record.usdPerUnit} USD</p>
              </>}
            </div>
            {section === 'notices' && 'status' in record && <Badge variant={record.status === 'Published' ? 'win' : 'muted'}>{record.status}</Badge>}
            <button type="button" className="p-1.5 text-muted hover:text-white" aria-label={`Edit ${record.id}`}
              onClick={() => startEdit(record)}>
              <Pencil size={14} />
            </button>
            <button type="button" className="p-1.5 text-muted hover:text-hot" aria-label={`Delete ${record.id}`}
              onClick={() => remove(record.id, 'name' in record ? record.name : 'title' in record ? record.title : record.currency)}>
              <Trash2 size={14} />
            </button>
          </article>
        ))}
        {records.length === 0 && <p className="rounded-lg border border-ink-700 bg-ink-900/40 p-4 text-sm text-muted">No entries have been added.</p>}
      </div>
      <Modal open={open} onClose={() => { setOpen(false); reset(); }} title={`${editingId ? 'Edit' : 'Add'} ${title}`} size="md"
        footer={<><button type="button" className="btn-ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</button><button type="submit" form="settings-catalog-form" className="btn-primary"><Check size={14} /> Save</button></>}>
        <form id="settings-catalog-form" onSubmit={save} className="space-y-3">
          {section === 'price-books' && <>
            <CatalogField label="Price book name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></CatalogField>
            <CatalogField label="Currency"><select className="input" value={currency} onChange={(event) => setCurrency(event.target.value as 'MVR' | 'USD')}><option value="MVR">MVR</option><option value="USD">USD</option></select></CatalogField>
            <CatalogField label="Product overrides (one CODE = PRICE per line)">
              <textarea className="input min-h-32" value={overridesText} onChange={(event) => setOverridesText(event.target.value)}
                placeholder="PRODUCT_CODE = 100.00" />
            </CatalogField>
          </>}
          {section === 'payee-accounts' && <>
            <CatalogField label="Insurer or vendor"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></CatalogField>
            <CatalogField label="Pre-approved account number"><input className="input" value={details} onChange={(event) => setDetails(event.target.value)} required /></CatalogField>
          </>}
          {section === 'notices' && <>
            <CatalogField label="Notice title"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></CatalogField>
            <CatalogField label="Message"><textarea className="input min-h-24" value={details} onChange={(event) => setDetails(event.target.value)} required /></CatalogField>
            <CatalogField label="Publication status"><select className="input" value={status} onChange={(event) => setStatus(event.target.value as TeamNotice['status'])}><option>Draft</option><option>Published</option><option>Retracted</option></select></CatalogField>
          </>}
          {section === 'strategic-goals' && <>
            <CatalogField label="Goal"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></CatalogField>
            <CatalogField label="Time horizon"><select className="input" value={horizon} onChange={(event) => setHorizon(event.target.value as StrategicGoal['horizon'])}><option>Quarterly</option><option>Short term</option><option>Long term</option></select></CatalogField>
            <div className="grid grid-cols-2 gap-3">
              <CatalogField label="Target"><input className="input" type="number" min="0.01" step="any" value={target} onChange={(event) => setTarget(event.target.value)} required /></CatalogField>
              <CatalogField label="Unit (e.g. MVR)"><input className="input" value={unit} onChange={(event) => setUnit(event.target.value)} required /></CatalogField>
            </div>
          </>}
          {section === 'exchange-rates' && <>
            <CatalogField label="Currency code"><input className="input" maxLength={3} value={name} onChange={(event) => setName(event.target.value.toUpperCase())} placeholder="MVR" required /></CatalogField>
            <CatalogField label="USD per currency unit"><input className="input" type="number" min="0.000001" step="any" value={usdPerUnit} onChange={(event) => setUsdPerUnit(event.target.value)} required /></CatalogField>
          </>}
          {error && <p role="alert" className="text-sm text-hot">{error}</p>}
        </form>
      </Modal>
    </section>
  );
}

function CatalogField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}
