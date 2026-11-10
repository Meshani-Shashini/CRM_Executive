import { useMemo, useState, type FormEvent } from 'react';
import { Building2, Globe2, Mail, MapPin, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { VENDOR_TYPES, normalizeVendorName } from '../data/vendors';
import { useApp } from '../store/AppContext';
import type { CompanyContactProfile, Vendor } from '../types';
import { isValidEmail, isValidPhoneNumber } from '../utils/communication';

const EMPTY_VENDOR_FORM = {
  name: '',
  vendorType: 'Insurer' as Vendor['vendorType'],
  country: 'Maldives',
  currency: 'MVR' as Vendor['currency'],
  address: '',
  taxId: '',
  licenseNo: '',
  email: '',
  phone: '',
  status: 'active' as Vendor['status'],
  notes: '',
};

export default function VendorsPage() {
  const { vendors, setVendors, deals, activities, quotationRequests, user, viewAsRole } = useApp();
  const activeRole = viewAsRole ?? user.role;
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY_VENDOR_FORM);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);
  const visibleVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      const matchesQuery = !normalizedQuery || [vendor.name, vendor.country, vendor.vendorType, vendor.email ?? '', vendor.phone ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesType = typeFilter === 'all' || vendor.vendorType === typeFilter;
      const matchesCountry = countryFilter === 'all' || vendor.country === countryFilter;
      const matchesStatus = statusFilter === 'all' || vendor.status === statusFilter;
      return matchesQuery && matchesType && matchesCountry && matchesStatus;
    });
  }, [countryFilter, query, statusFilter, typeFilter, vendors]);

  const uniqueCountries = useMemo(() => [...new Set(vendors.map((vendor) => vendor.country).filter(Boolean))].sort(), [vendors]);

  const openNewVendor = () => {
    setEditingVendor(null);
    setForm(EMPTY_VENDOR_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      vendorType: vendor.vendorType,
      country: vendor.country,
      currency: vendor.currency,
      address: vendor.address,
      taxId: vendor.taxId ?? '',
      licenseNo: vendor.licenseNo ?? '',
      email: vendor.email ?? '',
      phone: vendor.phone ?? '',
      status: vendor.status,
      notes: vendor.notes ?? '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError('Vendor name is required.');
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (form.phone && !isValidPhoneNumber(form.phone)) {
      setFormError('Phone number must be a valid +960 format (for example +960 1234567).');
      return;
    }
    const duplicate = vendors.find((vendor) => vendor.id !== editingVendor?.id && normalizeVendorName(vendor.name) === normalizeVendorName(name));
    if (duplicate) {
      setFormError('A vendor with the same name already exists.');
      return;
    }

    const nextVendor: Vendor = {
      id: editingVendor?.id ?? `vendor-${crypto.randomUUID()}`,
      name,
      vendorType: form.vendorType,
      country: form.country.trim() || 'Maldives',
      currency: form.currency,
      address: form.address.trim(),
      taxId: form.taxId.trim(),
      licenseNo: form.licenseNo.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      contacts: editingVendor?.contacts ?? (form.email || form.phone || form.name ? [{
        id: `contact-${crypto.randomUUID()}`,
        name,
        role: 'Primary Contact',
        email: form.email.trim(),
        phone: form.phone.trim(),
        whatsapp: '',
        telegram: '',
      } satisfies CompanyContactProfile] : []),
      status: form.status,
      notes: form.notes.trim(),
      createdAt: editingVendor?.createdAt ?? new Date().toISOString(),
    };

    setVendors((current) => (editingVendor ? current.map((vendor) => vendor.id === editingVendor.id ? nextVendor : vendor) : [nextVendor, ...current]));
    setModalOpen(false);
    setFormError('');
    setEditingVendor(null);
    setForm(EMPTY_VENDOR_FORM);
  };

  const selectedVendor = visibleVendors[0] ?? null;
  const detailVendor = selectedVendor ?? editingVendor ?? null;
  const linkedDeals = detailVendor
    ? deals.filter((deal) => deal.vendorId === detailVendor.id || deal.insurer.trim().toLowerCase() === detailVendor.name.trim().toLowerCase())
    : [];
  const linkedQuotes = detailVendor
    ? activities.filter((activity) => activity.type === 'quote' && (activity.insurer?.trim().toLowerCase() === detailVendor.name.trim().toLowerCase() || activity.clientId === detailVendor.id))
    : [];

  const deleteVendor = (vendor: Vendor) => {
    if (activeRole !== 'admin') return;
    const hasLinks = deals.some((deal) => deal.vendorId === vendor.id || deal.insurer.trim().toLowerCase() === vendor.name.trim().toLowerCase());
    const hasQuotationRequests = quotationRequests.some((request) => request.vendorIds.includes(vendor.id));
    if (hasQuotationRequests) {
      window.alert('This vendor cannot be deleted because it is linked to a quotation request.');
      return;
    }
    if (hasLinks) {
      window.alert('This vendor cannot be deleted because linked deals exist. Remove or reassign those deals first.');
      return;
    }
    setPendingDelete(vendor);
  };

  const confirmDelete = () => {
    if (!pendingDelete || activeRole !== 'admin') return;
    if (quotationRequests.some((request) => request.vendorIds.includes(pendingDelete.id))) {
      window.alert('This vendor cannot be deleted while it is linked to a quotation request.');
      setPendingDelete(null);
      return;
    }
    setVendors((current) => current.filter((vendor) => vendor.id !== pendingDelete.id));
    setPendingDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs text-muted">Insurers, reinsurers, surveyors, and loss adjusters managed as active broker-side vendor records.</p>
        </div>
        {activeRole !== 'finance' && (
          <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={openNewVendor}><Plus size={14} /> Add Vendor</button>
        )}
      </div>

      <div className="glass rounded-2xl p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-muted" size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors, country or contact" className="input w-full !pl-9" />
          </div>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input max-w-[150px]">
            <option value="all">All types</option>
            {VENDOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} className="input max-w-[150px]">
            <option value="all">All countries</option>
            {uniqueCountries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input max-w-[130px]">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="vendor-card-grid grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleVendors.length === 0 ? (
            <div className="glass flex w-full min-h-[220px] items-center justify-center rounded-2xl text-sm text-muted">No vendors match the current filters.</div>
          ) : (
            visibleVendors.map((vendor) => (
              <div key={vendor.id} className="glass w-full min-w-0 rounded-2xl border border-ink-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{vendor.name}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-brand-400">{vendor.vendorType}</div>
                  </div>
                  <span className={`pill ${vendor.status === 'active' ? 'bg-win/15 text-win border-win/40' : 'bg-ink-700 text-muted border-ink-600'}`}>
                    {vendor.status}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-xs text-muted">
                  <div className="flex items-center gap-2"><Globe2 size={12} /> {vendor.country}</div>
                  <div className="flex items-center gap-2"><Building2 size={12} /> {vendor.currency}</div>
                  {vendor.email && <div className="flex items-center gap-2"><Mail size={12} /> {vendor.email}</div>}
                  {vendor.phone && <div className="flex items-center gap-2"><Phone size={12} /> {vendor.phone}</div>}
                  {vendor.address && <div className="flex items-start gap-2"><MapPin size={12} className="mt-0.5" /> {vendor.address}</div>}
                </div>

                <div className="mt-4 flex items-center justify-between text-[10px] text-muted">
                  <span>{deals.filter((deal) => deal.vendorId === vendor.id || deal.insurer.trim().toLowerCase() === vendor.name.trim().toLowerCase()).length} linked deals</span>
                  <div className="flex gap-2">
                    {activeRole !== 'finance' && <button type="button" className="text-brand-400" onClick={() => openEditVendor(vendor)}><Pencil size={14} /></button>}
                    {activeRole === 'admin' && <button type="button" className="text-hot" onClick={() => deleteVendor(vendor)}><Trash2 size={14} /></button>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {detailVendor && (
          <aside className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-muted">Vendor detail</div>
                <div className="mt-1 text-lg font-semibold text-white">{detailVendor.name}</div>
              </div>
              <span className={`pill ${detailVendor.status === 'active' ? 'bg-win/15 text-win border-win/40' : 'bg-ink-700 text-muted border-ink-600'}`}>{detailVendor.status}</span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-muted">
              <div><span className="text-white">Type:</span> {detailVendor.vendorType}</div>
              <div><span className="text-white">Country:</span> {detailVendor.country}</div>
              <div><span className="text-white">Currency:</span> {detailVendor.currency}</div>
              {detailVendor.taxId && <div><span className="text-white">Tax ID:</span> {detailVendor.taxId}</div>}
              {detailVendor.licenseNo && <div><span className="text-white">License:</span> {detailVendor.licenseNo}</div>}
            </div>

            <div className="mt-5 border-t border-ink-700 pt-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted"><ShieldCheck size={12} /> Linked deals</div>
              {linkedDeals.length === 0 ? <div className="text-sm text-muted">No linked deals.</div> : (
                <div className="space-y-2">
                  {linkedDeals.slice(0, 5).map((deal) => <div key={deal.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-2 text-xs text-muted"><div className="font-medium text-white">{deal.client}</div><div>{deal.product} · {deal.stage}</div></div>)}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-ink-700 pt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">Quotation requests</div>
              {linkedQuotes.length === 0 ? <div className="text-sm text-muted">No quotation requests yet.</div> : (
                <div className="space-y-2">
                  {linkedQuotes.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-2 text-xs text-muted">
                      <div className="font-medium text-white">{activity.title}</div>
                      <div>{activity.date}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFormError(''); setEditingVendor(null); setForm(EMPTY_VENDOR_FORM); }}
        title={editingVendor ? 'Edit vendor' : 'Add vendor'}
        subtitle="Create or update vendor master data used for insurer selection and supplier tracking."
        size="lg"
        footer={(
          <>
            <button type="button" className="btn-ghost" onClick={() => { setModalOpen(false); setFormError(''); setEditingVendor(null); setForm(EMPTY_VENDOR_FORM); }}><X size={14} /> Cancel</button>
            <button type="submit" form="vendor-form" className="btn-primary">{editingVendor ? 'Save changes' : 'Create vendor'}</button>
          </>
        )}
      >
        <form id="vendor-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
          <label className="block sm:col-span-2">
            <div className="text-xs text-muted mb-1.5">Vendor name *</div>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="input" required />
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Type *</div>
            <select value={form.vendorType} onChange={(event) => setForm((current) => ({ ...current, vendorType: event.target.value as Vendor['vendorType'] }))} className="input">
              {VENDOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Status</div>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Vendor['status'] }))} className="input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Country</div>
            <input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} list="country-list" className="input" />
            <datalist id="country-list">
              {uniqueCountries.map((country) => <option key={country} value={country} />)}
            </datalist>
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Currency</div>
            <select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value as Vendor['currency'] }))} className="input">
              <option value="MVR">MVR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <div className="text-xs text-muted mb-1.5">Address</div>
            <input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="input" />
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Tax ID</div>
            <input value={form.taxId} onChange={(event) => setForm((current) => ({ ...current, taxId: event.target.value }))} className="input" />
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">License number</div>
            <input value={form.licenseNo} onChange={(event) => setForm((current) => ({ ...current, licenseNo: event.target.value }))} className="input" />
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Email</div>
            <input value={form.email} type="email" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="input" />
          </label>
          <label className="block">
            <div className="text-xs text-muted mb-1.5">Phone</div>
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="input" placeholder="+960 1234567" />
          </label>
          <label className="block sm:col-span-2">
            <div className="text-xs text-muted mb-1.5">Notes</div>
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="input min-h-[90px]" />
          </label>
          {formError && <div className="sm:col-span-2 rounded-lg border border-hot/30 bg-hot/10 px-3 py-2 text-xs text-hot">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete vendor"
        subtitle="This action removes the vendor master record."
        footer={(
          <>
            <button type="button" className="btn-ghost" onClick={() => setPendingDelete(null)}><X size={14} /> Cancel</button>
            <button type="button" className="btn-danger" onClick={confirmDelete}>Delete</button>
          </>
        )}
      >
        <p className="text-sm text-muted">Are you sure you want to delete <span className="font-semibold text-white">{pendingDelete?.name}</span>? This vendor is not linked to any active deals.</p>
      </Modal>
    </div>
  );
}
