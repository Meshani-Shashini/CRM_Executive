import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { TAX_RATES, USERS, COMPANY } from '../data/seed';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import {
  Settings as SettingsIcon, Percent, Mail, Users as UsersIcon, ShieldAlert,
  Save, Plus, Pencil, Trash2, Check, Lock,
} from 'lucide-react';
import type { TaxRate, Role } from '../types';

type Tab = 'general' | 'tax' | 'email' | 'users';

export default function SettingsPage() {
  const { user, hasAccess, taxRates, setTaxRates } = useApp();
  const [tab, setTab] = useState<Tab>('tax');
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [open, setOpen] = useState(false);

  if (!hasAccess(['admin'])) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-2xl p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-hot/10 border border-hot/30 flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-hot" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-sm text-muted mt-2">
            System Settings and Tax / VAT Configuration can only be modified by a System Admin.
            Your current role (<span className="text-white">{user.title}</span>) does not have permission.
          </p>
          <div className="mt-4 text-xs text-muted">
            Switch to the System Admin role from the sidebar profile to access this module.
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof SettingsIcon }[] = [
    { key: 'general', label: 'General', icon: SettingsIcon },
    { key: 'tax', label: 'VAT / GST Config', icon: Percent },
    { key: 'email', label: 'Email Templates', icon: Mail },
    { key: 'users', label: 'Users & Roles', icon: UsersIcon },
  ];

  const saveTax = (t: TaxRate) => {
    const exists = taxRates.some((x) => x.id === t.id);
    setTaxRates(exists ? taxRates.map((x) => (x.id === t.id ? t : x)) : [...taxRates, t]);
    setOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-4 flex items-center gap-3 border-l-4 border-l-brand-400">
        <ShieldAlert size={18} className="text-brand-400" />
        <div className="text-sm">
          <span className="text-white font-semibold">Admin-protected module.</span>{' '}
          <span className="text-muted">Changes to tax rates and global parameters affect all invoices and MIRA reports.</span>
        </div>
      </div>

      <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1 w-fit overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                tab === t.key ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'general' && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Company Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Labeled label="Legal Name" value={COMPANY.legalName} />
            <Labeled label="Registration" value={COMPANY.registration} />
            <Labeled label="Email" value={COMPANY.email} />
            <Labeled label="Phone" value={COMPANY.phone} />
            <div className="sm:col-span-2"><Labeled label="Address" value={COMPANY.address} /></div>
          </div>
          <button className="btn-primary"><Save size={14} /> Save Changes</button>
        </div>
      )}

      {tab === 'tax' && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Tax / VAT Configuration</h3>
              <p className="text-xs text-muted mt-0.5">Define active GST rates used in invoice generation and MIRA reporting.</p>
            </div>
            <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary !py-1.5"><Plus size={14} /> Add Rate</button>
          </div>
          <div className="space-y-2">
            {taxRates.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-ink-900/50 rounded-lg p-3 border border-ink-600">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-400/10 border border-brand-400/30 flex items-center justify-center text-brand-400 font-bold text-sm">
                    {t.rate}%
                  </div>
                  <div>
                    <div className="text-sm text-white font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted">{t.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.active ? 'win' : 'muted'} dot>{t.active ? 'Active' : 'Inactive'}</Badge>
                  <button onClick={() => { setEditing(t); setOpen(true); }} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white"><Pencil size={14} /></button>
                  <button className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-hot"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Email Templates</h3>
          <div className="space-y-2">
            {['Renewal Reminder (30/60/90)', 'Quotation Sent', 'Invoice Issued', 'Payment Receipt', 'Payment Overdue'].map((tpl) => (
              <div key={tpl} className="flex items-center justify-between bg-ink-900/50 rounded-lg p-3 border border-ink-600">
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-brand-400" />
                  <div className="text-sm text-white">{tpl}</div>
                </div>
                <button className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Users & Roles (RBAC)</h3>
            <button className="btn-primary !py-1.5"><Plus size={14} /> Add User</button>
          </div>
          <div className="space-y-2">
            {USERS.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-ink-900/50 rounded-lg p-3 border border-ink-600">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white">
                    {u.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="text-sm text-white">{u.name}</div>
                    <div className="text-[11px] text-muted">{u.email}</div>
                  </div>
                </div>
                <Badge variant={u.role === 'admin' ? 'hot' : 'brand'}>{roleLabel[u.role]}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <TaxModal open={open} onClose={() => setOpen(false)} initial={editing} onSave={saveTax} />
    </div>
  );
}

const roleLabel: Record<Role, string> = {
  admin: 'System Admin', sales: 'Sales Agent', finance: 'Accountant', client: 'Client',
};

function Labeled({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5">{label}</div>
      <input className="input" defaultValue={value} />
    </label>
  );
}

function TaxModal({
  open, onClose, initial, onSave,
}: {
  open: boolean; onClose: () => void; initial: TaxRate | null; onSave: (t: TaxRate) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rate, setRate] = useState(initial?.rate ?? 8);
  const [category, setCategory] = useState<TaxRate['category']>(initial?.category ?? 'Standard');
  const [active, setActive] = useState(initial?.active ?? true);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Tax Rate' : 'Add Tax Rate'}
      subtitle="VAT / GST configuration"
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onSave({ id: initial?.id ?? `t${Date.now()}`, name, rate, category, active })}
          >
            <Check size={14} /> Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <div className="text-xs text-muted mb-1.5">Rate Name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard GST" />
        </label>
        <label className="block">
          <div className="text-xs text-muted mb-1.5">Rate (%)</div>
          <input className="input" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </label>
        <label className="block">
          <div className="text-xs text-muted mb-1.5">Category</div>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as TaxRate['category'])}>
            <option>Standard</option><option>Tourism</option><option>Zero-rated</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-brand-500" />
          Active
        </label>
      </div>
    </Modal>
  );
}
