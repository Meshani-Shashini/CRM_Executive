import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpDown, Building2, Columns3, Eye, Filter, List, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import TableShell from '../components/table/TableShell';
import TableRowActionsMenu from '../components/ui/TableRowActionsMenu';
import PageToolbar from '../components/ui/PageToolbar';
import ViewModeSwitcher from '../components/ui/ViewModeSwitcher';
import { avatarCode } from '../components/table/avatar';
import { VENDOR_TYPES, normalizeVendorName } from '../data/vendors';
import { useApp } from '../store/AppContext';
import type { CompanyContactProfile, Vendor, VendorType } from '../types';
import { isValidEmail, isValidPhoneNumber } from '../utils/communication';

type VendorSortKey = 'name' | 'vendorType' | 'country' | 'currency' | 'contact' | 'linkedDeals' | 'quotationRequests' | 'status';
type VendorGroupBy = 'vendorType' | 'status' | 'country';

function getVendorContact(vendor: Vendor) {
  const contact = vendor.contacts?.find((item) => item.name.trim() || item.phone.trim() || item.email.trim());
  const name = contact?.name.trim();
  const phone = contact?.phone.trim() || vendor.phone?.trim();
  const email = contact?.email.trim() || vendor.email?.trim();
  return { name, phone, email, search: [name, phone, email].filter(Boolean).join(' ') };
}

function getVendorDeals(vendor: Vendor, deals: ReturnType<typeof useApp>['deals']) {
  return deals.filter((deal) =>
    deal.vendorId === vendor.id || deal.insurer.trim().toLowerCase() === vendor.name.trim().toLowerCase(),
  );
}

function getVendorRequests(vendor: Vendor, quotationRequests: ReturnType<typeof useApp>['quotationRequests']) {
  return quotationRequests.flatMap((request) => request.lines
    .filter((line) => line.vendorId === vendor.id)
    .map((line) => ({ request, line })));
}

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
  const { vendors, setVendors, deals, quotationRequests, user, viewAsRole, dataReady } = useApp();
  const activeRole = viewAsRole ?? user.role;
  const [view, setView] = useState<'list' | 'kanban'>(() => localStorage.getItem('vendorsView') === 'kanban' ? 'kanban' : 'list');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<VendorGroupBy>('vendorType');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [sortKey, setSortKey] = useState<VendorSortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [actionMenu, setActionMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [draggedVendorId, setDraggedVendorId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY_VENDOR_FORM);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => {
    setSelectedVendorId('');
    setActionMenu(null);
    drawerTriggerRef.current?.focus();
  }, []);
  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? null;

  useEffect(() => {
    localStorage.setItem('vendorsView', view);
  }, [view]);

  useEffect(() => {
    if (!filtersOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !filtersRef.current?.contains(event.target)) setFiltersOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!selectedVendor || modalOpen || pendingDelete || deleteBlockedMessage || filtersOpen) return;
    drawerCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer();
        return;
      }
      if (event.key === 'Tab' && drawerRef.current) {
        const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVendor, modalOpen, pendingDelete, deleteBlockedMessage, filtersOpen, closeDrawer]);

  const visibleVendors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return vendors.filter((vendor) => {
      const contactValues = (vendor.contacts ?? []).flatMap((contact) => [contact.name, contact.phone, contact.email]);
      const matchesQuery = !normalizedQuery || [vendor.name, vendor.country, vendor.email ?? '', vendor.phone ?? '', ...contactValues]
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
  const sortedVendors = useMemo(() => [...visibleVendors].sort((a, b) => {
    const value = (vendor: Vendor): string | number => {
      switch (sortKey) {
        case 'name': return vendor.name;
        case 'vendorType': return vendor.vendorType;
        case 'country': return vendor.country;
        case 'currency': return vendor.currency;
        case 'contact': return getVendorContact(vendor).search;
        case 'linkedDeals': return getVendorDeals(vendor, deals).length;
        case 'quotationRequests': return getVendorRequests(vendor, quotationRequests).length;
        case 'status': return vendor.status;
      }
    };
    const left = value(a);
    const right = value(b);
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
    return result * (sortDirection === 'asc' ? 1 : -1);
  }), [visibleVendors, sortKey, sortDirection, deals, quotationRequests]);
  const filterActiveCount = [typeFilter !== 'all', countryFilter !== 'all', statusFilter !== 'all'].filter(Boolean).length;
  const groupOptions = groupBy === 'vendorType'
    ? [...new Set(vendors.map((vendor) => vendor.vendorType))].sort().map((value) => ({ value, label: value }))
    : groupBy === 'status'
      ? [...new Set(vendors.map((vendor) => vendor.status))].sort().map((value) => ({ value, label: value === 'active' ? 'Active' : 'Inactive' }))
      : uniqueCountries.map((value) => ({ value, label: value }));
  const groupedVendors = groupOptions.map(({ value, label }) => ({
    value,
    label,
    vendors: sortedVendors.filter((vendor) => vendor[groupBy] === value),
  })).filter((group) => group.vendors.length > 0 || groupBy !== 'country');

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

  const updateVendorGroup = (vendorId: string, value: string) => {
    if (activeRole === 'finance') return;
    setVendors((current) => current.map((vendor) => {
      if (vendor.id !== vendorId) return vendor;
      if (groupBy === 'vendorType' && VENDOR_TYPES.includes(value as VendorType)) return { ...vendor, vendorType: value as VendorType };
      if (groupBy === 'status' && (value === 'active' || value === 'inactive')) return { ...vendor, status: value };
      if (groupBy === 'country') return { ...vendor, country: value };
      return vendor;
    }));
    setDraggedVendorId('');
  };
  const deleteVendor = (vendor: Vendor) => {
    if (activeRole !== 'admin') return;
    const hasLinks = getVendorDeals(vendor, deals).length > 0;
    const hasQuotationRequests = getVendorRequests(vendor, quotationRequests).length > 0;
    if (hasQuotationRequests) {
      setDeleteBlockedMessage(`This vendor cannot be deleted because "${vendor.name}" is linked to a quotation request.`);
      return;
    }
    if (hasLinks) {
      setDeleteBlockedMessage(`This vendor cannot be deleted because linked deals exist for "${vendor.name}". Remove or reassign those deals first.`);
      return;
    }
    setPendingDelete(vendor);
  };

  const confirmDelete = () => {
    if (!pendingDelete || activeRole !== 'admin') return;
    const hasQuotationRequests = getVendorRequests(pendingDelete, quotationRequests).length > 0;
    const hasLinks = getVendorDeals(pendingDelete, deals).length > 0;
    if (hasQuotationRequests || hasLinks) {
      setDeleteBlockedMessage(hasQuotationRequests
        ? `This vendor cannot be deleted because "${pendingDelete.name}" is linked to a quotation request.`
        : `This vendor cannot be deleted because linked deals exist for "${pendingDelete.name}". Remove or reassign those deals first.`);
      setPendingDelete(null);
      return;
    }
    setVendors((current) => current.filter((vendor) => vendor.id !== pendingDelete.id));
    if (selectedVendorId === pendingDelete.id) setSelectedVendorId('');
    setPendingDelete(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageToolbar name="vendors" className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeSwitcher label="Vendor views" value={view} onChange={setView} options={[
            { value: 'list', label: 'List view', Icon: List },
            { value: 'kanban', label: 'Board view', Icon: Columns3 },
          ]} />
          {activeRole !== 'finance' && <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs" onClick={openNewVendor}><Plus size={13} /> Vendor</button>}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Badge variant="brand"><span className="font-semibold">{visibleVendors.length}</span> {visibleVendors.length === 1 ? 'vendor' : 'vendors'}</Badge>
          <label className="relative w-full max-w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors" aria-label="Search vendors" className="input !py-1.5 pl-9 !text-xs" />
          </label>
          <div ref={filtersRef} className="relative">
            <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" aria-label="Filter vendors" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
              <Filter size={13} /> Filter{filterActiveCount > 0 && <Badge variant="brand" compact>{filterActiveCount}</Badge>}
            </button>
            {filtersOpen && <div role="dialog" aria-label="Filter vendors" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-ink-600 bg-ink-900 p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Filter vendors</h2>
                <button type="button" aria-label="Close vendor filters" className="btn-ghost !p-1" onClick={() => setFiltersOpen(false)}><X size={14} /></button>
              </div>
              <div className="space-y-3">
                <label className="block text-xs text-muted">Type
                  <select aria-label="Filter vendors by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input mt-1 !py-1.5 !text-xs">
                    <option value="all">All types</option>{VENDOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-muted">Country
                  <select aria-label="Filter vendors by country" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} className="input mt-1 !py-1.5 !text-xs">
                    <option value="all">All countries</option>{uniqueCountries.map((country) => <option key={country} value={country}>{country}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-muted">Status
                  <select aria-label="Filter vendors by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input mt-1 !py-1.5 !text-xs">
                    <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex justify-end border-t border-ink-700 pt-3">
                <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => { setTypeFilter('all'); setCountryFilter('all'); setStatusFilter('all'); }}>Clear all</button>
              </div>
            </div>}
          </div>
        </div>
      </PageToolbar>

      {filterActiveCount > 0 && <div className="flex flex-wrap items-center gap-1.5" aria-label="Active vendor filters">
        {typeFilter !== 'all' && <button type="button" onClick={() => setTypeFilter('all')}><Badge variant="cold">Type: {typeFilter} <X size={10} /></Badge></button>}
        {countryFilter !== 'all' && <button type="button" onClick={() => setCountryFilter('all')}><Badge variant="cold">Country: {countryFilter} <X size={10} /></Badge></button>}
        {statusFilter !== 'all' && <button type="button" onClick={() => setStatusFilter('all')}><Badge variant="cold">Status: {statusFilter} <X size={10} /></Badge></button>}
        <button type="button" className="text-xs text-muted underline hover:text-white" onClick={() => { setTypeFilter('all'); setCountryFilter('all'); setStatusFilter('all'); }}>Clear all</button>
      </div>}

      {view === 'list' ? <>
        <TableShell className="vendors-table-fit hidden max-h-[calc(100vh-13rem)] overflow-auto md:block">
        {!dataReady ? <div role="status" aria-label="Loading vendors" className="space-y-2 p-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-md bg-ink-800/80" />)}
        </div> : <table aria-label="Vendors" className="vendors-table w-full leading-tight">
          <colgroup>
            <col style={{ width: '18%' }} /><col style={{ width: '8%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '18%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '13%' }} /><col style={{ width: '10%' }} /><col style={{ width: '5%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#111214] font-semibold text-[#D0D3D9]">
            <tr>
              {([
                ['name', 'Vendor Name'], ['vendorType', 'Type'], ['country', 'Country'], ['currency', 'Currency'],
                ['contact', 'Contact'], ['linkedDeals', 'Linked Deals'], ['quotationRequests', 'Quotation Requests'], ['status', 'Status'],
              ] as const).map(([key, label]) => <th key={key} scope="col" aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className={`border-b border-[#1B1E22] ${key === 'currency' || key === 'contact' ? 'px-2.5' : 'px-1.5'} py-2 text-left`}>
                <button type="button" className="inline-flex items-center gap-1 text-left hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400" onClick={() => {
                  if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
                  else { setSortKey(key); setSortDirection('asc'); }
                }}>{label}<ArrowUpDown size={11} className="shrink-0 text-muted" /></button>
              </th>)}
              <th scope="col" className="border-b border-[#1B1E22] px-1 py-2 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sortedVendors.map((vendor) => {
              const contact = getVendorContact(vendor);
              const vendorDeals = getVendorDeals(vendor, deals);
              const vendorRequests = getVendorRequests(vendor, quotationRequests);
              const statusVariant = vendor.status === 'active' ? 'win' : 'muted';
              const openRowDetails = (element: HTMLElement) => {
                drawerTriggerRef.current = element;
                setSelectedVendorId(vendor.id);
              };
              return <tr key={vendor.id} tabIndex={0} aria-label={`Open ${vendor.name}`} onClick={(event) => {
                if ((event.target as HTMLElement).closest('button')) return;
                openRowDetails(event.currentTarget);
              }} onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                  event.preventDefault();
                  openRowDetails(event.currentTarget);
                }
              }} className="cursor-pointer border-b border-[#1B1E22] text-[#D0D3D9] transition hover:bg-[#111214] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                <td data-label="Vendor Name" className="px-1.5 py-2"><span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#292B30] text-[10px] font-semibold text-[#A4A6AE]">{avatarCode(vendor.name)}</span>
                  <span className="truncate font-semibold text-white" title={vendor.name}>{vendor.name}</span>
                </span></td>
                <td data-label="Type" className="px-1.5 py-2"><Badge variant="cold" compact><span className="truncate uppercase">{vendor.vendorType}</span></Badge></td>
                <td data-label="Country" className="px-1.5 py-2"><span className="block truncate" title={vendor.country}>{vendor.country || '—'}</span></td>
                <td data-label="Currency" className="px-2.5 py-2">{vendor.currency || '—'}</td>
                <td data-label="Contact" className="px-2.5 py-2"><span className="block min-w-0 truncate" title={[contact.name, contact.phone, contact.email].filter(Boolean).join(' · ')}>
                  {contact.name && <span className="block truncate text-white">{contact.name}</span>}
                  {!contact.name && !contact.phone && !contact.email ? '—' : <span className="block truncate text-[10px] text-muted">{[contact.phone, contact.email].filter(Boolean).join(' · ')}</span>}
                </span></td>
                <td data-label="Linked Deals" className="px-1.5 py-2"><button type="button" className="text-left text-brand-300 hover:text-white" title={vendorDeals.map((deal) => deal.client).join(', ') || 'No linked deals'} aria-label={`${vendorDeals.length} linked deals for ${vendor.name}`} onClick={(event) => openRowDetails(event.currentTarget)}>{vendorDeals.length} linked {vendorDeals.length === 1 ? 'deal' : 'deals'}</button></td>
                <td data-label="Quotation Requests" className="px-1.5 py-2"><button type="button" className="text-left text-brand-300 hover:text-white" title={vendorRequests.map(({ line }) => line.reference).join(', ') || 'No quotation requests'} aria-label={`${vendorRequests.length} quotation request lines for ${vendor.name}`} onClick={(event) => openRowDetails(event.currentTarget)}>{vendorRequests.length} lines</button></td>
                <td data-label="Status" className="px-1.5 py-2"><Badge variant={statusVariant} compact>{vendor.status}</Badge></td>
                <td data-label="Actions" className="px-1 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                  <button type="button" aria-label={`Actions for ${vendor.name}`} aria-haspopup="menu" aria-expanded={actionMenu?.id === vendor.id && Boolean(actionMenu.anchor.closest('table[aria-label="Vendors"]'))} className="btn-ghost !p-1.5" onClick={(event) => setActionMenu(actionMenu?.id === vendor.id ? null : { id: vendor.id, anchor: event.currentTarget })}><MoreHorizontal size={15} /></button>
                  <TableRowActionsMenu open={actionMenu?.id === vendor.id && Boolean(actionMenu.anchor.closest('table[aria-label="Vendors"]'))} anchor={actionMenu?.id === vendor.id ? actionMenu.anchor : null} label={`${vendor.name} actions`}>
                    <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { drawerTriggerRef.current = actionMenu?.anchor ?? null; setSelectedVendorId(vendor.id); setActionMenu(null); }}><Eye size={13} /> View Details</button>
                    {activeRole !== 'finance' && <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { openEditVendor(vendor); setActionMenu(null); }}><Pencil size={13} /> Edit Vendor</button>}
                    {activeRole === 'admin' && <button type="button" role="menuitem" className="table-row-actions-item text-hot" onClick={() => { deleteVendor(vendor); setActionMenu(null); }}><Trash2 size={13} /> Delete Vendor</button>}
                  </TableRowActionsMenu>
                </td>
              </tr>;
            })}
            {sortedVendors.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-sm text-muted">{dataReady ? 'No vendors match your search or filters.' : 'Loading vendors…'}</td></tr>}
          </tbody>
        </table>}
      </TableShell>
      <div className="min-h-[12rem] md:hidden">
        {!dataReady ? <div role="status" aria-label="Loading vendors" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-xl border border-ink-700 bg-ink-800/80" />)}
        </div> : sortedVendors.length === 0 ? <div className="rounded-xl border border-ink-700 bg-ink-950 px-4 py-12 text-center text-sm text-muted">No vendors match your search or filters.</div> : <div data-testid="vendors-card-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sortedVendors.map((vendor) => {
            const contact = getVendorContact(vendor);
            const vendorDeals = getVendorDeals(vendor, deals);
            const vendorRequests = getVendorRequests(vendor, quotationRequests);
            const statusVariant = vendor.status === 'active' ? 'win' : 'muted';
            const openDetails = (element: HTMLElement) => {
              drawerTriggerRef.current = element;
              setSelectedVendorId(vendor.id);
            };
            return <article key={vendor.id} tabIndex={0} aria-label={`Open ${vendor.name}`} onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) return;
              openDetails(event.currentTarget);
            }} onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                event.preventDefault();
                openDetails(event.currentTarget);
              }
            }} className="cursor-pointer rounded-lg border border-ink-700 bg-ink-800/80 p-3 shadow-sm transition hover:border-brand-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
              <div className="mb-3 flex items-start justify-between gap-2 border-b border-ink-700/80 pb-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#292B30] text-[10px] font-semibold text-[#A4A6AE]">{avatarCode(vendor.name)}</span>
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-bold text-white">{vendor.name}</h3>
                    <div className="mt-1"><Badge variant="cold" compact>{vendor.vendorType.toUpperCase()}</Badge></div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={statusVariant} compact>{vendor.status}</Badge>
                  <button type="button" aria-label={`Actions for ${vendor.name}`} aria-haspopup="menu" aria-expanded={actionMenu?.id === vendor.id && Boolean(actionMenu.anchor.closest('[data-testid="vendors-card-grid"]'))} className="btn-ghost !p-1" onClick={(event) => setActionMenu(actionMenu?.id === vendor.id ? null : { id: vendor.id, anchor: event.currentTarget })}><MoreHorizontal size={15} /></button>
                  <TableRowActionsMenu open={actionMenu?.id === vendor.id && Boolean(actionMenu.anchor.closest('[data-testid="vendors-card-grid"]'))} anchor={actionMenu?.id === vendor.id ? actionMenu.anchor : null} label={`${vendor.name} actions`}>
                    <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { drawerTriggerRef.current = actionMenu?.anchor ?? null; setSelectedVendorId(vendor.id); setActionMenu(null); }}><Eye size={13} /> View Details</button>
                    {activeRole !== 'finance' && <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { openEditVendor(vendor); setActionMenu(null); }}><Pencil size={13} /> Edit Vendor</button>}
                    {activeRole === 'admin' && <button type="button" role="menuitem" className="table-row-actions-item text-hot" onClick={() => { deleteVendor(vendor); setActionMenu(null); }}><Trash2 size={13} /> Delete Vendor</button>}
                  </TableRowActionsMenu>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {([
                  ['Type', vendor.vendorType],
                  ['Country', vendor.country || '—'],
                  ['Currency', vendor.currency || '—'],
                  ['Contact', contact.name || '—'],
                  ['Phone', contact.phone || '—'],
                  ['Email', contact.email || '—'],
                  ['Linked Deals', <button type="button" className="text-left text-brand-300 hover:text-white" title={vendorDeals.map((deal) => deal.client).join(', ') || 'No linked deals'} onClick={(event) => { event.stopPropagation(); openDetails(event.currentTarget); }}>{vendorDeals.length} linked {vendorDeals.length === 1 ? 'deal' : 'deals'}</button>],
                  ['Quotation Requests', <button type="button" className="text-left text-brand-300 hover:text-white" title={vendorRequests.map(({ line }) => line.reference).join(', ') || 'No quotation requests'} onClick={(event) => { event.stopPropagation(); openDetails(event.currentTarget); }}>{vendorRequests.length} {vendorRequests.length === 1 ? 'line' : 'lines'}</button>],
                  ['Status', <Badge variant={statusVariant} compact>{vendor.status}</Badge>],
                  ...(vendor.address ? [['Address', vendor.address] as const] : []),
                  ...(vendor.taxId ? [['Tax ID', vendor.taxId] as const] : []),
                  ...(vendor.licenseNo ? [['License', vendor.licenseNo] as const] : []),
                ] as const).map(([label, value]) => <div key={label} className="min-w-0">
                  <dt className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="break-words text-xs text-[#E1E2E5]">{value}</dd>
                </div>)}
              </dl>
            </article>;
          })}
        </div>}
      </div>
      </> : <div className="min-h-[24rem] overflow-x-auto rounded-lg border border-[#1B1E22] bg-ink-950 p-3">
        <div className="mb-3 flex justify-end">
          <label className="flex items-center gap-2 text-xs text-muted">Group by
            <select aria-label="Group vendors by" className="input !w-auto !py-1.5 !text-xs" value={groupBy} onChange={(event) => setGroupBy(event.target.value as VendorGroupBy)}>
              <option value="vendorType">Type</option><option value="status">Status</option><option value="country">Country</option>
            </select>
          </label>
        </div>
        {!dataReady ? <div role="status" aria-label="Loading vendors" className="grid min-w-[560px] grid-cols-2 gap-3">
          {[0, 1].map((column) => <div key={column} className="h-64 animate-pulse rounded-xl bg-ink-800/80" />)}
        </div> : groupedVendors.length === 0 ? <div className="py-16 text-center text-sm text-muted">No vendors match your search or filters.</div> : <div data-testid="vendors-kanban-board" className="flex min-h-[22rem] min-w-max gap-3">
          {groupedVendors.map(({ value, label, vendors: columnVendors }) => <section key={value} data-testid="vendors-kanban-column" aria-label={`${label} vendors`} onDragOver={(event) => {
            if (activeRole !== 'finance') {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          }} onDrop={(event) => {
            event.preventDefault();
            const vendorId = event.dataTransfer.getData('text/vendor-id');
            if (vendorId) updateVendorGroup(vendorId, value);
          }} className="flex min-h-[22rem] w-[min(82vw,360px)] min-w-[280px] flex-col rounded-xl border border-ink-700 bg-ink-900/55 p-2.5">
            <header className="mb-2 flex min-h-11 items-start justify-between gap-2 px-1">
              <h2 className="truncate text-sm font-semibold text-white" title={label}>{label}</h2><Badge variant="muted">{columnVendors.length}</Badge>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg bg-ink-950/40 p-1.5">
              {columnVendors.map((vendor) => {
                const contact = getVendorContact(vendor);
                const vendorDeals = getVendorDeals(vendor, deals);
                const vendorRequests = getVendorRequests(vendor, quotationRequests);
                return <article key={vendor.id} draggable={activeRole !== 'finance'} onDragStart={(event) => {
                  setDraggedVendorId(vendor.id);
                  event.dataTransfer.setData('text/vendor-id', vendor.id);
                  event.dataTransfer.effectAllowed = 'move';
                }} onDragEnd={() => setDraggedVendorId('')} className={`rounded-lg border border-ink-700 bg-ink-800/80 p-3 shadow-sm transition hover:border-brand-400/50 ${draggedVendorId === vendor.id ? 'opacity-50' : ''}`}>
                  <div className="mb-2 flex min-w-0 items-start gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#292B30] text-[10px] font-semibold text-[#A4A6AE]">{avatarCode(vendor.name)}</span>
                    <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setSelectedVendorId(vendor.id); }} className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                      <span className="block truncate text-xs font-semibold text-white" title={vendor.name}>{vendor.name}</span>
                      <span className="mt-1 block"><Badge variant="cold" compact>{vendor.vendorType.toUpperCase()}</Badge></span>
                    </button>
                    <Badge variant={vendor.status === 'active' ? 'win' : 'muted'} compact>{vendor.status}</Badge>
                  </div>
                  <div className="space-y-1 text-[10px] text-muted">
                    <div className="truncate">{vendor.country} · {vendor.currency}</div>
                    {contact.name && <div className="truncate">{contact.name}</div>}
                    {contact.phone && <div className="truncate">{contact.phone}</div>}
                    {contact.email && <div className="truncate">{contact.email}</div>}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-ink-700 pt-2 text-[10px] text-muted">
                    <span>{vendorDeals.length} linked deals · {vendorRequests.length} requests</span>
                    <div className="flex gap-2">
                      {activeRole !== 'finance' && <button type="button" aria-label={`Edit vendor ${vendor.name}`} className="text-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400" onClick={() => openEditVendor(vendor)}><Pencil size={14} /></button>}
                      {activeRole === 'admin' && <button type="button" aria-label={`Delete vendor ${vendor.name}`} className="text-hot focus-visible:outline focus-visible:outline-2 focus-visible:outline-hot" onClick={() => deleteVendor(vendor)}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                </article>;
              })}
              {columnVendors.length === 0 && <p className="py-7 text-center text-[11px] text-muted/60">Drop vendors here</p>}
            </div>
          </section>)}
        </div>}
      </div>}

      {selectedVendor && <div className="fixed inset-0 z-[70] flex justify-end" role="presentation">
        <button type="button" aria-label="Close vendor details" className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
        <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="vendor-drawer-title" className="client-drawer-enter relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-ink-600 bg-ink-950 shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-ink-700 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#292B30] text-xs font-semibold text-[#A4A6AE]">{avatarCode(selectedVendor.name)}</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Vendor detail</p>
                <h2 id="vendor-drawer-title" className="truncate text-lg font-semibold text-white">{selectedVendor.name}</h2>
              </div>
              <Badge variant={selectedVendor.status === 'active' ? 'win' : 'muted'} compact>{selectedVendor.status}</Badge>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeRole !== 'finance' && <button type="button" className="btn-ghost !py-2" onClick={() => { setSelectedVendorId(''); openEditVendor(selectedVendor); }}><Pencil size={14} /> Edit Vendor</button>}
              {activeRole === 'admin' && <button type="button" className="btn-ghost !py-2 text-hot" onClick={() => { setSelectedVendorId(''); deleteVendor(selectedVendor); }}><Trash2 size={14} /> Delete Vendor</button>}
              <button ref={drawerCloseRef} type="button" aria-label="Close vendor details" className="btn-ghost !p-2" onClick={closeDrawer}><X size={16} /></button>
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section className="glass rounded-xl p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Building2 size={15} /> Vendor Information</h3>
              <div className="space-y-2 text-sm text-muted">
                <p><span className="text-white">Type:</span> {selectedVendor.vendorType}</p>
                <p><span className="text-white">Country:</span> {selectedVendor.country || '—'}</p>
                <p><span className="text-white">Currency:</span> {selectedVendor.currency}</p>
                {selectedVendor.address && <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" /> {selectedVendor.address}</p>}
                {selectedVendor.phone && <p className="flex items-center gap-2"><Phone size={14} /> {selectedVendor.phone}</p>}
                {selectedVendor.email && <p className="flex items-center gap-2"><Mail size={14} /> {selectedVendor.email}</p>}
                {selectedVendor.taxId && <p><span className="text-white">Tax ID:</span> {selectedVendor.taxId}</p>}
                {selectedVendor.licenseNo && <p><span className="text-white">License:</span> {selectedVendor.licenseNo}</p>}
                {(selectedVendor.contacts ?? []).map((contact) => <div key={contact.id} className="border-t border-ink-700 pt-2">
                  <p className="font-medium text-white">{contact.name || 'Contact'}</p>
                  {contact.role && <p>{contact.role}</p>}
                  {contact.phone && <p>{contact.phone}</p>}
                  {contact.email && <p>{contact.email}</p>}
                </div>)}
              </div>
            </section>
            <section className="glass rounded-xl p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted"><ShieldCheck size={13} /> Linked Deals</h3>
              {getVendorDeals(selectedVendor, deals).length === 0 ? <p className="text-sm text-muted">No linked deals.</p> : <div className="space-y-2">
                {getVendorDeals(selectedVendor, deals).map((deal) => <div key={deal.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-xs">
                  <p className="font-medium text-white">{deal.client}</p>
                  <p className="mt-1 text-muted">{deal.product} · {deal.stage}</p>
                </div>)}
              </div>}
            </section>
            <section className="glass rounded-xl p-4">
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.12em] text-muted">Quotation Requests</h3>
              {getVendorRequests(selectedVendor, quotationRequests).length === 0 ? <p className="text-sm text-muted">No quotation requests yet.</p> : <div className="space-y-2">
                {getVendorRequests(selectedVendor, quotationRequests).map(({ request, line }) => {
                  const deal = deals.find((item) => item.id === request.dealId);
                  return <div key={line.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium text-white">{line.reference}</p><Badge variant={line.status === 'Quoted' ? 'win' : 'muted'} compact>{line.status}</Badge></div>
                    <p className="mt-1 text-muted">Batch {request.reference} · {deal ? `${deal.client} · ${deal.product}` : 'Deal unavailable'}</p>
                    {deal && <p className="mt-0.5 text-muted">{deal.stage}</p>}
                  </div>;
                })}
              </div>}
            </section>
          </div>
        </aside>
      </div>}

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
        <p className="text-sm text-muted">Are you sure you want to delete <span className="font-semibold text-white">{pendingDelete?.name}</span>? This vendor has no linked deals or quotation requests.</p>
      </Modal>
      <Modal
        open={Boolean(deleteBlockedMessage)}
        onClose={() => setDeleteBlockedMessage('')}
        title="Vendor can’t be deleted"
        size="sm"
        footer={<button type="button" className="btn-primary" onClick={() => setDeleteBlockedMessage('')}>Understood</button>}
      >
        <p role="alert" className="text-sm leading-relaxed text-muted">{deleteBlockedMessage}</p>
      </Modal>
    </div>
  );
}
