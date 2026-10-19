import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import {
  Settings as SettingsIcon, Percent, Mail, Users as UsersIcon, ShieldAlert,
  Save, Plus, Pencil, Trash2, Check, Lock,
} from 'lucide-react';
import type { TaxRate, Role } from '../types';

type Tab = 'general' | 'tax' | 'email' | 'users';

export default function SettingsPage() {
  const { user, hasAccess, taxRates, setTaxRates, users, setUsers, company, setCompany } = useApp();
  const [tab, setTab] = useState<Tab>('tax');
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [userError, setUserError] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState('');
  const [notice, setNotice] = useState('');
  const [companyDetails, setCompanyDetails] = useState(company);
  const [emailTemplates, setEmailTemplates] = useState(() => {
    try {
      const saved = window.localStorage.getItem('ibms:email-templates');
      return saved ? JSON.parse(saved) as Record<string, string> : Object.fromEntries(['Renewal Reminder (30/60/90)', 'Quotation Sent', 'Invoice Issued', 'Payment Receipt', 'Payment Overdue'].map((name) => [name, '']));
    } catch (error) {
      console.error('Could not load email templates from browser storage.', error);
      return {};
    }
  });

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
    setNotice('Tax rate saved.');
  };

  const saveCompany = () => {
    setCompany(companyDetails);
    setNotice('Company settings updated.');
  };

  const saveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    const email = String(data.get('email')).trim();
    if (users.some((existing) => existing.email.toLowerCase() === email.toLowerCase())) {
      setUserError('A user with this email address already exists.');
      return;
    }
    const newUser = {
      id: `u-${Date.now()}`,
      name,
      email,
      role: data.get('role') as Role,
      title: String(data.get('title')).trim(),
    };
    setUsers([...users, newUser]);
    setUserOpen(false);
    setUserError('');
    setNotice(`User ${name} added.`);
  };

  const saveTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingTemplate === null) return;
    const next = { ...emailTemplates, [editingTemplate]: templateText };
    try {
      window.localStorage.setItem('ibms:email-templates', JSON.stringify(next));
      setEmailTemplates(next);
      setEditingTemplate(null);
      setNotice('Email template saved.');
    } catch (error) {
      console.error('Could not save email template to browser storage.', error);
      setNotice('Unable to save the email template. Check browser storage permissions.');
    }
  };

  return (
    <div className="space-y-5">
      {notice && <div role="status" className="rounded-lg border border-win/30 bg-win/10 px-4 py-2 text-sm text-win">{notice}<button className="float-right" onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
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
            <Labeled label="Legal Name" value={companyDetails.legalName} onChange={(value) => setCompanyDetails({ ...companyDetails, legalName: value })} />
            <Labeled label="Registration" value={companyDetails.registration} onChange={(value) => setCompanyDetails({ ...companyDetails, registration: value })} />
            <Labeled label="Email" value={companyDetails.email} onChange={(value) => setCompanyDetails({ ...companyDetails, email: value })} />
            <Labeled label="Phone" value={companyDetails.phone} onChange={(value) => setCompanyDetails({ ...companyDetails, phone: value })} />
            <div className="sm:col-span-2"><Labeled label="Address" value={companyDetails.address} onChange={(value) => setCompanyDetails({ ...companyDetails, address: value })} /></div>
          </div>
          <button className="btn-primary" onClick={saveCompany}><Save size={14} /> Save Changes</button>
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
                  <button onClick={() => { if (window.confirm(`Delete the ${t.name} tax rate?`)) { setTaxRates(taxRates.filter((rate) => rate.id !== t.id)); setNotice(`${t.name} deleted.`); } }} aria-label={`Delete ${t.name}`} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-hot"><Trash2 size={14} /></button>
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
            {Object.keys(emailTemplates).map((tpl) => (
              <div key={tpl} className="flex items-center justify-between bg-ink-900/50 rounded-lg p-3 border border-ink-600">
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-brand-400" />
                  <div><div className="text-sm text-white">{tpl}</div><div className="text-xs text-muted truncate max-w-lg">{emailTemplates[tpl] || 'No custom content yet'}</div></div>
                </div>
                <button onClick={() => { setEditingTemplate(tpl); setTemplateText(emailTemplates[tpl] ?? ''); }} aria-label={`Edit ${tpl}`} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Users & Roles (RBAC)</h3>
            <button className="btn-primary !py-1.5" onClick={() => setUserOpen(true)}><Plus size={14} /> Add User</button>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
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
      <Modal open={userOpen} onClose={() => { setUserOpen(false); setUserError(''); }} title="Add User" subtitle="Add a user and assign an application role." footer={<><button type="button" className="btn-ghost" onClick={() => { setUserOpen(false); setUserError(''); }}>Cancel</button><button type="submit" form="new-user-form" className="btn-primary"><Plus size={14} /> Add User</button></>}>
        <form id="new-user-form" onSubmit={saveUser} className="space-y-3">
          <Field label="Full name"><input className="input" name="name" required /></Field>
          <Field label="Email"><input className="input" name="email" type="email" required /></Field>
          {userError && <p role="alert" className="text-sm text-hot">{userError}</p>}
          <Field label="Job title"><input className="input" name="title" /></Field>
          <Field label="Role"><select className="input" name="role"><option value="sales">Sales Agent</option><option value="finance">Accountant</option><option value="client">Client</option><option value="admin">System Admin</option></select></Field>
        </form>
      </Modal>
      <Modal open={editingTemplate !== null} onClose={() => setEditingTemplate(null)} title={`Edit ${editingTemplate ?? ''} template`} footer={<><button className="btn-ghost" onClick={() => setEditingTemplate(null)}>Cancel</button><button type="submit" form="edit-template-form" className="btn-primary"><Save size={14} /> Save</button></>}>
        <form id="edit-template-form" onSubmit={saveTemplate}><Field label="Template content"><textarea className="input min-h-40" value={templateText} onChange={(event) => setTemplateText(event.target.value)} required /></Field></form>
      </Modal>
    </div>
  );
}

const roleLabel: Record<Role, string> = {
  admin: 'System Admin', sales: 'Sales Agent', finance: 'Accountant', client: 'Client',
};

function Labeled({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5">{label}</div>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
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

  useEffect(() => {
    setName(initial?.name ?? '');
    setRate(initial?.rate ?? 8);
    setCategory(initial?.category ?? 'Standard');
    setActive(initial?.active ?? true);
  }, [initial, open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ id: initial?.id ?? `t${Date.now()}`, name: name.trim(), rate, category, active });
  };

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
          <button type="submit" form="tax-rate-form" className="btn-primary"><Check size={14} /> Save</button>
        </>
      }
    >
      <form id="tax-rate-form" onSubmit={submit} className="space-y-3">
        <label className="block">
          <div className="text-xs text-muted mb-1.5">Rate Name</div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard GST" required />
        </label>
        <label className="block">
          <div className="text-xs text-muted mb-1.5">Rate (%)</div>
          <input className="input" type="number" min="0" max="100" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} required />
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
      </form>
    </Modal>
  );
}
