import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import {
  Settings as SettingsIcon, Percent, Mail, Users as UsersIcon, ShieldAlert,
  Save, Plus, Pencil, Trash2, Check, Lock, Package, ClipboardList,
} from 'lucide-react';
import type { Activity, TaxRate, Role, User, ProductCode, Lead, Deal } from '../types';
import { PRODUCT_CODES } from '../data/catalogs';

type Tab = 'general' | 'tax' | 'products' | 'email' | 'users' | 'audit';

export default function SettingsPage({ initialTab }: { initialTab?: Tab } = {}) {
  const {
    user, hasAccess, taxRates, setTaxRates, users, createUser, updateUserProfile,
    company, setCompany, emailTemplates, setEmailTemplates, products, setProducts, leads, deals,
    activities, setActivities,
  } = useApp();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'tax');
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userError, setUserError] = useState('');
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateText, setTemplateText] = useState('');
  const [notice, setNotice] = useState('');
  const [companyDetails, setCompanyDetails] = useState(company);

  useEffect(() => setCompanyDetails(company), [company]);

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
          <div className="mt-4 text-xs text-muted">Sign in with an account assigned the System Admin role to access this module.</div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof SettingsIcon }[] = [
    { key: 'general', label: 'General', icon: SettingsIcon },
    { key: 'tax', label: 'VAT / GST Config', icon: Percent },
    { key: 'products', label: 'Item / Product Management', icon: Package },
    { key: 'email', label: 'Email Templates', icon: Mail },
    { key: 'users', label: 'Users & Roles', icon: UsersIcon },
    { key: 'audit', label: 'Audit Trail', icon: ClipboardList },
  ];
  const auditEntries = activities
    .filter((activity) => activity.id.startsWith('audit-') && !isBusinessAudit(activity))
    .sort((left, right) => Date.parse(right.createdAt ?? right.date) - Date.parse(left.createdAt ?? left.date));

  const logSystemAudit = (title: string, description: string) => {
    const now = new Date().toISOString();
    const audit: Activity = {
      id: `audit-system-${crypto.randomUUID()}`,
      clientId: '',
      type: 'note',
      title,
      description,
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    };
    setActivities([audit, ...activities]);
  };

  const saveTax = (t: TaxRate) => {
    const exists = taxRates.some((x) => x.id === t.id);
    setTaxRates(exists ? taxRates.map((x) => (x.id === t.id ? t : x)) : [...taxRates, t]);
    logSystemAudit(exists ? 'Tax rate updated' : 'Tax rate added', t.name);
    setOpen(false);
    setEditing(null);
    setNotice('Tax rate saved.');
  };

  const saveCompany = () => {
    setCompany(companyDetails);
    logSystemAudit('Company settings updated', companyDetails.legalName);
    setNotice('Company settings updated.');
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    const email = String(data.get('email')).trim();
    setUserSubmitting(true);
    try {
      await createUser({
        name,
        email,
        password: String(data.get('password') ?? ''),
        role: data.get('role') as Role,
        title: String(data.get('title') ?? '').trim(),
      });
      logSystemAudit('User account created', `${name} · ${email}`);
      setUserOpen(false);
      setUserError('');
      setNotice(`User ${name} added.`);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Could not create user.');
    } finally {
      setUserSubmitting(false);
    }
  };

  const saveUserProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const title = String(data.get('title') ?? '').trim();
    const role = String(data.get('role') ?? editingUser.role) as Role;
    setUserSubmitting(true);
    try {
      await updateUserProfile({ id: editingUser.id, name, title, role });
      logSystemAudit('User profile updated', `${editingUser.name} → ${name}`);
      setEditingUser(null);
      setUserError('');
      setNotice(`User profile for ${name} updated. Authentication email is unchanged.`);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Could not update user profile.');
    } finally {
      setUserSubmitting(false);
    }
  };

  const saveTemplate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingTemplate === null) return;
    setEmailTemplates({ ...emailTemplates, [editingTemplate]: templateText });
    logSystemAudit('Email template updated', editingTemplate);
    setEditingTemplate(null);
    setNotice('Email template saved.');
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
                  <button onClick={() => { if (window.confirm(`Delete the ${t.name} tax rate?`)) { setTaxRates(taxRates.filter((rate) => rate.id !== t.id)); logSystemAudit('Tax rate deleted', t.name); setNotice(`${t.name} deleted.`); } }} aria-label={`Delete ${t.name}`} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-hot"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'products' && (
        <ProductManagement products={products} setProducts={setProducts} leads={leads} deals={deals} onNotice={setNotice} onAudit={logSystemAudit} />
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
                    {u.title && <div className="text-[11px] text-muted">{u.title}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.role === 'admin' ? 'hot' : 'brand'}>{roleLabel[u.role]}</Badge>
                  <button type="button" className="btn-ghost !px-2 !py-1.5" onClick={() => { setEditingUser(u); setUserError(''); }} aria-label={`Edit profile for ${u.name}`} title="Edit user profile">
                    <Pencil size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <section className="glass rounded-2xl p-5" aria-labelledby="audit-trail-heading">
          <div className="mb-4">
            <h3 id="audit-trail-heading" className="text-sm font-normal text-white">Audit Trail</h3>
            <p className="mt-1 text-xs font-normal text-white">System and configuration changes recorded by this application.</p>
          </div>
          <p className="mb-3 rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-xs font-normal text-white">
            Sign-in and sign-out events are not currently captured by this application and are not available in this trail.
          </p>
          {auditEntries.length ? (
            <div className="divide-y divide-ink-700/70">
              {auditEntries.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 lg:grid lg:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)_minmax(12rem,auto)] lg:items-center lg:gap-4 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-2 lg:py-2">
                  <h4 className="text-sm font-normal text-white lg:truncate" title={entry.title}>{entry.title}</h4>
                  <p className="mt-2 text-xs font-normal text-white lg:mt-0 lg:truncate" title={entry.description}>{entry.description || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] font-normal text-white lg:mt-0 lg:justify-end">
                    <span className="whitespace-nowrap">{entry.actorName ?? users.find((person) => person.id === entry.userId)?.name ?? entry.userId}</span>
                    <time className="whitespace-nowrap" dateTime={entry.createdAt ?? entry.date}>{formatAuditTimestamp(entry.createdAt ?? entry.date)}</time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm font-normal text-white">No system audit events have been recorded.</p>
          )}
        </section>
      )}

      <TaxModal open={open} onClose={() => setOpen(false)} initial={editing} onSave={saveTax} />
      <Modal open={userOpen} onClose={() => { setUserOpen(false); setUserError(''); }} title="Add User" subtitle="Add a user and assign an application role." footer={<><button type="button" className="btn-ghost" onClick={() => { setUserOpen(false); setUserError(''); }}>Cancel</button><button type="submit" form="new-user-form" className="btn-primary" disabled={userSubmitting}><Plus size={14} /> {userSubmitting ? 'Adding…' : 'Add User'}</button></>}>
        <form id="new-user-form" onSubmit={saveUser} className="space-y-3">
          <Field label="Full name"><input className="input" name="name" required /></Field>
          <Field label="Email"><input className="input" name="email" type="email" required /></Field>
          {userError && <p role="alert" className="text-sm text-hot">{userError}</p>}
          <Field label="Job title"><input className="input" name="title" /></Field>
          <Field label="Temporary password (minimum 12 characters)"><input className="input" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></Field>
          <Field label="Role"><select className="input" name="role"><option value="sales">Sales</option><option value="finance">Accountant</option><option value="client">Client</option><option value="admin">System Admin</option></select></Field>
        </form>
      </Modal>
      <Modal
        open={editingUser !== null}
        onClose={() => { setEditingUser(null); setUserError(''); }}
        title="Edit User Profile"
        subtitle="Update the display name, job title, or application role. Authentication email cannot be changed here."
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => { setEditingUser(null); setUserError(''); }}>Cancel</button>
          <button type="submit" form="edit-user-form" className="btn-primary" disabled={userSubmitting}>
            <Save size={14} /> {userSubmitting ? 'Saving…' : 'Save Profile'}
          </button>
        </>}
      >
        {editingUser && (
          <form id="edit-user-form" onSubmit={saveUserProfile} className="space-y-3">
            <Field label="Full name"><input className="input" name="name" defaultValue={editingUser.name} required /></Field>
            <Field label="Job title"><input className="input" name="title" defaultValue={editingUser.title ?? ''} /></Field>
            <Field label="Role">
              <select className="input" name="role" defaultValue={editingUser.role} disabled={editingUser.id === user.id}>
                <option value="sales">Sales</option>
                <option value="finance">Accountant</option>
                <option value="client">Client</option>
                <option value="admin">System Admin</option>
              </select>
              {editingUser.id === user.id && <span className="mt-1 block text-xs text-muted">Your own role cannot be changed here.</span>}
            </Field>
            {userError && <p role="alert" className="text-sm text-hot">{userError}</p>}
          </form>
        )}
      </Modal>
      <Modal open={editingTemplate !== null} onClose={() => setEditingTemplate(null)} title={`Edit ${editingTemplate ?? ''} template`} footer={<><button className="btn-ghost" onClick={() => setEditingTemplate(null)}>Cancel</button><button type="submit" form="edit-template-form" className="btn-primary"><Save size={14} /> Save</button></>}>
        <form id="edit-template-form" onSubmit={saveTemplate}><Field label="Template content"><textarea className="input min-h-40" value={templateText} onChange={(event) => setTemplateText(event.target.value)} required /></Field></form>
      </Modal>
    </div>
  );
}

const roleLabel: Record<Role, string> = {
  admin: 'System Admin', sales: 'Sales', finance: 'Accountant', client: 'Client',
};

function isBusinessAudit(activity: Activity) {
  return /^(?:Lead|Deal) created$|^(?:Lead|Deal) stage changed:|^Lead temperature changed:/.test(activity.title)
    || (activity.title === 'Lead updated' && activity.description.includes('Activity status:'));
}

function formatAuditTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? timestamp.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown time';
}

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

function ProductManagement({
  products, setProducts, leads, deals, onNotice, onAudit,
}: {
  products: ProductCode[];
  setProducts: Dispatch<SetStateAction<ProductCode[]>>;
  leads: Lead[];
  deals: Deal[];
  onNotice: (message: string) => void;
  onAudit: (title: string, description: string) => void;
}) {
  const [editing, setEditing] = useState<ProductCode | null>(null);
  const [form, setForm] = useState<ProductCode | null>(null);
  const [error, setError] = useState('');
  const [pendingProductDeletion, setPendingProductDeletion] = useState<ProductCode | null>(null);
  const builtInCodes = new Set(PRODUCT_CODES.map((product) => product.code));
  const startAdd = () => {
    setEditing(null);
    setError('');
    setForm({
      code: '', name: '', description: '', category: 'Miscellaneous', classType: 'CUSTOM',
      defaultPipelineCode: 'COMMERCIAL', standardBrokerageRatePct: 0,
      isStatutoryMandatory: false, salesCycleVelocity: '14–30 Days', riskLevel: 'Medium',
      keyUnderwritingIntakeArtifacts: 'Completed proposal form, asset/risk schedule and prior claims history',
    });
  };

  const startEdit = (product: ProductCode) => {
    setEditing(product);
    setError('');
    setForm({
      ...product,
      description: product.description || product.name,
      salesCycleVelocity: product.salesCycleVelocity || '14–30 Days',
      riskLevel: product.riskLevel || 'Medium',
      keyUnderwritingIntakeArtifacts: product.keyUnderwritingIntakeArtifacts || 'Completed proposal form, asset/risk schedule and prior claims history',
    });
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    const product = {
      ...form,
      id: form.id || form.code.trim().toUpperCase() || crypto.randomUUID(),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || form.name.trim(),
      classType: form.classType.trim(),
      standardBrokerageRatePct: Number(form.standardBrokerageRatePct),
      salesCycleVelocity: form.salesCycleVelocity?.trim() || '14–30 Days',
      riskLevel: form.riskLevel || 'Medium',
      keyUnderwritingIntakeArtifacts: form.keyUnderwritingIntakeArtifacts?.trim() || 'Completed proposal form, asset/risk schedule and prior claims history',
      defaultPipelineCode: 'COMMERCIAL',
    };
    const duplicateCode = products.some((item) => item.code.trim().toUpperCase() === product.code && item.code.trim().toUpperCase() !== editing?.code.trim().toUpperCase());
    const duplicateName = products.some((item) => item.name.trim().toLowerCase() === product.name.toLowerCase() && item.code !== editing?.code);
    if (!product.code || !product.name || !product.classType || duplicateCode || duplicateName || !Number.isFinite(product.standardBrokerageRatePct) || product.standardBrokerageRatePct < 0 || product.standardBrokerageRatePct > 100) {
      setError('Enter a unique product code, name, class, and a brokerage rate from 0 to 100.');
      return;
    }
    setProducts((current) => editing
      ? current.map((item) => item.code === editing.code ? product : item)
      : [...current, product]);
    onAudit(editing ? 'Product updated' : 'Product added', `${product.code} · ${product.name}`);
    onNotice(`${product.name} ${editing ? 'updated' : 'added'} and synced to the catalog.`);
    setForm(null);
    setEditing(null);
  };

  const productDeleteBlockReason = (product: ProductCode) => {
    if (!product.code.trim()) {
      return 'Unable to delete this product because it has no product code.';
    }
    if (builtInCodes.has(product.code)) {
      return `${product.name} is a seeded NM CODES product and cannot be deleted.`;
    }
    const linkedLeads = leads.filter((lead) => lead.productCode === product.code && lead.status !== 'COMPLETED');
    const linkedDeals = deals.filter((deal) => {
      const matchesProduct = deal.productCode === product.code || (!deal.productCode && deal.product === product.name);
      const stage = deal.stage.trim().toLowerCase();
      const isClosed = deal.disposition === 'won' || deal.disposition === 'lost'
        || /won|bound|renewed|policy issued|lost|declined/.test(stage);
      return matchesProduct && !isClosed;
    });
    if (linkedLeads.length > 0 || linkedDeals.length > 0) {
      const linkedTypes = [
        linkedLeads.length > 0 ? `${linkedLeads.length} active lead${linkedLeads.length === 1 ? '' : 's'}` : '',
        linkedDeals.length > 0 ? `${linkedDeals.length} active deal${linkedDeals.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' and ');
      return `Cannot delete ${product.name}: it is linked to ${linkedTypes}. Reassign or close those records first.`;
    }
    if (!products.some((item) => item.code === product.code)) {
      return `${product.name} could not be deleted because it is no longer in the catalog.`;
    }
    return '';
  };

  const handleDeleteProduct = (product: ProductCode) => {
    const reason = productDeleteBlockReason(product);
    if (reason) {
      onNotice(reason);
      return;
    }
    setPendingProductDeletion(product);
  };

  const confirmDeleteProduct = () => {
    if (!pendingProductDeletion) return;
    const reason = productDeleteBlockReason(pendingProductDeletion);
    if (reason) {
      onNotice(reason);
      setPendingProductDeletion(null);
      return;
    }
    const product = pendingProductDeletion;
    setProducts((current) => current.filter((item) => item.code !== product.code));
    onAudit('Product deleted', `${product.code} · ${product.name}`);
    onNotice(`${product.name} deleted from the catalog and queued for Supabase sync.`);
    setPendingProductDeletion(null);
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-white font-semibold">Item / Product Management</h3>
            <p className="text-xs text-muted mt-0.5">Manage the 49 NM CODES products and custom insurance items used by Lead and Deal forms. Products share the main product-filtered placement pipeline.</p>
          </div>
          <button type="button" className="btn-primary !py-1.5" onClick={startAdd}><Plus size={14} /> Add Product</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1500px]">
            <thead className="text-[11px] uppercase tracking-wider text-muted border-b border-ink-600">
              <tr><th className="text-left px-3 py-2">Class</th><th className="text-left px-3 py-2">Product Code</th><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Brokerage %</th><th className="text-left px-3 py-2">Mandatory</th><th className="text-left px-3 py-2">Pipeline Model</th><th className="text-left px-3 py-2">Sales Cycle / Velocity</th><th className="text-left px-3 py-2">Risk Level</th><th className="text-left px-3 py-2 min-w-[360px]">Key Underwriting Intake Artifacts</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.code} className="border-b border-ink-700/60">
                  <td className="px-3 py-2 text-muted">{product.classType}</td>
                  <td className="px-3 py-2 text-white font-medium">{product.code}</td>
                  <td className="px-3 py-2 text-muted">{product.description || product.name}</td>
                  <td className="px-3 py-2 text-right text-brand-300">{product.standardBrokerageRatePct}%</td>
                  <td className="px-3 py-2"><Badge variant={product.isStatutoryMandatory ? 'hot' : 'muted'}>{product.isStatutoryMandatory ? 'Yes' : 'No'}</Badge></td>
                  <td className="px-3 py-2 text-muted">Shared product-filtered</td>
                  <td className="px-3 py-2 text-muted">{product.salesCycleVelocity ?? '14–30 Days'}</td>
                  <td className="px-3 py-2"><Badge variant={product.riskLevel === 'Very High' || product.riskLevel === 'High' ? 'hot' : product.riskLevel === 'Low' ? 'cold' : 'muted'}>{product.riskLevel ?? 'Medium'}</Badge></td>
                  <td className="px-3 py-2 text-muted whitespace-normal">{product.keyUnderwritingIntakeArtifacts ?? 'Completed proposal form, asset/risk schedule and prior claims history'}</td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1"><button type="button" className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white" onClick={() => startEdit(product)} aria-label={`Edit ${product.name}`}><Pencil size={14} /></button><button type="button" className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-hot" onClick={() => handleDeleteProduct(product)} aria-label={`Delete ${product.name}`} title={builtInCodes.has(product.code) ? 'Seeded NM CODES products cannot be deleted' : 'Delete custom product'}><Trash2 size={14} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={Boolean(form)} onClose={() => { setForm(null); setEditing(null); setError(''); }} title={editing ? 'Edit Product' : 'Add Product'} subtitle="Update the master product classification matrix." size="lg" footer={<><button type="button" className="btn-ghost" onClick={() => { setForm(null); setEditing(null); setError(''); }}>Cancel</button><button type="submit" form="product-form" className="btn-primary"><Check size={14} /> Save Product</button></>}>
        {form && <form id="product-form" onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Product Code *"><input className="input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} required /></Field>
            <Field label="Name *"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="Description *"><input className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
            <Field label="Industry Class *"><input className="input" value={form.classType} onChange={(event) => setForm({ ...form, classType: event.target.value })} required /></Field>
            <Field label="Category"><input className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
            <Field label="Standard Brokerage Rate (%) *"><input className="input" type="number" min="0" max="100" step="0.01" value={form.standardBrokerageRatePct} onChange={(event) => setForm({ ...form, standardBrokerageRatePct: Number(event.target.value) })} required /></Field>
            <div className="sm:col-span-2 rounded-lg border border-ink-600 bg-ink-900/40 p-3 text-xs text-muted">All products use the shared commercial placement pipeline. Retail, SME, and renewal workflows are selected at the deal level.</div>
            <Field label="Sales Cycle / Velocity *"><input className="input" value={form.salesCycleVelocity ?? ''} onChange={(event) => setForm({ ...form, salesCycleVelocity: event.target.value })} placeholder="e.g. 3–7 Days" required /></Field>
            <Field label="Risk Level *"><select className="input" value={form.riskLevel ?? 'Medium'} onChange={(event) => setForm({ ...form, riskLevel: event.target.value as ProductCode['riskLevel'] })} required><option>Low</option><option>Medium</option><option>High</option><option>Very High</option></select></Field>
            <Field label="Key Underwriting Intake Artifacts *"><textarea className="input min-h-[88px] sm:col-span-2" value={form.keyUnderwritingIntakeArtifacts ?? ''} onChange={(event) => setForm({ ...form, keyUnderwritingIntakeArtifacts: event.target.value })} required /></Field>
            <label className="flex items-center gap-2 text-sm text-white self-end"><input type="checkbox" checked={form.isStatutoryMandatory} onChange={(event) => setForm({ ...form, isStatutoryMandatory: event.target.checked })} className="accent-brand-500" /> Statutory mandatory</label>
            {error && <p role="alert" className="sm:col-span-2 text-sm text-hot">{error}</p>}
          </form>}
      </Modal>
      <Modal
        open={Boolean(pendingProductDeletion)}
        onClose={() => setPendingProductDeletion(null)}
        title="Delete product?"
        subtitle={`Delete “${pendingProductDeletion?.name ?? ''}”? This action cannot be undone.`}
        size="sm"
        footer={<><button type="button" className="btn-ghost" onClick={() => setPendingProductDeletion(null)}>Cancel</button><button type="button" className="btn-primary !bg-hot-600" onClick={confirmDeleteProduct}>Delete Product</button></>}
      >
        <p className="text-sm text-muted">The product will be removed from the item master if no active leads or deals are linked to it.</p>
      </Modal>
    </div>
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
