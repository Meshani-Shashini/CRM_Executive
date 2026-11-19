import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PRODUCT_CODES } from '../data/catalogs';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import ActivityTimelineItem from '../components/ActivityTimelineItem';
import { useApp } from '../store/AppContext';
import { supabase } from '../lib/supabase';
import {
  Phone, Mail, MapPin, Calendar, List, Columns3,
  Building2, Briefcase, ShieldCheck, Plus, Search, Pencil, Trash2,
  Filter, MoreHorizontal, X,
} from 'lucide-react';
import type { Activity, Client, CompanyContactProfile, Vendor } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, toMvr } from '../utils/currency';
import { formatDate } from '../utils/date';
import DateInput from '../components/ui/DateInput';
import { hasCompleteClientProfile, INCOMPLETE_COMPANY_TAG } from '../utils/customerProfile';
import { findMatchingContactProfile, linkContactProfile, mergeContactProfiles } from '../utils/contactProfiles';
import { formatStaffIdentifier } from '../utils/staff';
import { hashParams } from '../utils/navigation';
import TableShell from '../components/table/TableShell';
import { avatarCode } from '../components/table/avatar';
import TableRowActionsMenu from '../components/ui/TableRowActionsMenu';
import PageToolbar from '../components/ui/PageToolbar';
import ViewModeSwitcher from '../components/ui/ViewModeSwitcher';
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanPill } from '../components/kanban';

type ClientStatus = 'Active' | 'Draft' | 'Renewal Due' | 'Info incomplete';
type DirectoryTab = 'people' | 'organizations';
type OrganizationType = 'Customer' | 'Supplier' | 'Partner';
type PeopleGroupBy = 'role' | 'organization';
type OrganizationGroupBy = 'status' | 'type' | 'country';

function emailDomain(email?: string) {
  const atIndex = email?.lastIndexOf('@') ?? -1;
  return atIndex >= 0 ? email?.slice(atIndex + 1).trim().toLowerCase() ?? '' : '';
}

interface PersonDirectoryRow {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  client: Client;
}

interface OrganizationDirectoryRow {
  id: string;
  name: string;
  type: OrganizationType;
  domain: string;
  phone: string;
  client?: Client;
  vendor?: Vendor;
}

function getPeopleDirectoryRows(sourceClients: Client[]): PersonDirectoryRow[] {
  return sourceClients.flatMap((client) => {
    const profiles = mergeContactProfiles(client.contacts)
      .filter((contact) => contact.name.trim() || contact.email.trim() || contact.phone.trim());
    if (profiles.length > 0) {
      return profiles.map((contact) => ({
        id: `${client.id}:${contact.id}`,
        name: contact.name || 'Unnamed contact',
        title: contact.role,
        email: contact.email,
        phone: contact.phone,
        client,
      }));
    }
    const name = client.contactPerson || client.insuredEntity?.primaryStakeholder.fullName || '';
    return name ? [{
      id: `${client.id}:primary`,
      name,
      title: client.insuredEntity?.primaryStakeholder.designation ?? '',
      email: client.email,
      phone: client.phone,
      client,
    }] : [];
  });
}

export default function ClientsPage() {
  const { clients, setClients, leads, setLeads, deals, setDeals, invoices, activities, setActivities, vendors = [], user, users, dataReady, settingsCatalogs } = useApp();
  const [selectedId, setSelectedId] = useState('');
  const [portalClientId, setPortalClientId] = useState(user.clientId ?? '');
  const [view, setView] = useState<'list' | 'kanban'>(() => localStorage.getItem('clientsView') === 'kanban' ? 'kanban' : 'list');
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>('organizations');
  const [peopleGroupBy, setPeopleGroupBy] = useState<PeopleGroupBy>('role');
  const [organizationGroupBy, setOrganizationGroupBy] = useState<OrganizationGroupBy>('status');
  const [organizationTypeFilter, setOrganizationTypeFilter] = useState<'all' | OrganizationType>('all');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('');
  const [countryFilter, setCountryFilter] = useState('');
  const [actionMenu, setActionMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);
  const closeDrawer = useCallback(() => {
    setSelectedId('');
    setActionMenu(null);
    const [route, queryString = ''] = window.location.hash.split('?');
    const params = new URLSearchParams(queryString);
    if (params.has('id')) {
      params.delete('id');
      window.history.replaceState(window.history.state, '', `${route}${params.size ? `?${params}` : ''}`);
    }
    drawerTriggerRef.current?.focus();
  }, []);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<Client | null>(null);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');
  const [isPortalEdit, setIsPortalEdit] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityClientId, setActivityClientId] = useState('');
  useEffect(() => {
    const syncSelectedClient = () => {
      const requestedId = hashParams().get('id') ?? '';
      if (requestedId && clients.some((client) => client.id === requestedId
        && (user.role !== 'client' || client.id === user.clientId))) {
        setSelectedId(requestedId);
      }
    };
    syncSelectedClient();
    window.addEventListener('hashchange', syncSelectedClient);
    return () => window.removeEventListener('hashchange', syncSelectedClient);
  }, [clients, user.clientId, user.role]);
  const visibleClients = user.role === 'client'
    ? clients.filter((client) => Boolean(portalClientId) && client.id === portalClientId)
    : clients;
  const selected = visibleClients.find((c) => c.id === selectedId);
  const activityClient = visibleClients.find((client) => client.id === activityClientId) ?? selected;
  const modalOpen = Boolean(editingClient || pendingDeletion || deleteBlockedMessage || activityOpen || createOpen || filterOpen);
  useEffect(() => {
    localStorage.setItem('clientsView', view);
  }, [view]);
  useEffect(() => {
    if (!selected || modalOpen) {
      return;
    }
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
  }, [selected, modalOpen, closeDrawer]);
  const isTimelineActivity = (activity: Activity) => !activity.id.startsWith('audit-')
    || /^(?:Lead|Deal) created$|^(?:Lead|Deal) stage changed:|^Lead temperature changed:/.test(activity.title)
    || (activity.title === 'Lead updated' && activity.description.includes('Activity status:'));
  const clientActivities = activities.filter((activity) =>
    activity.clientId === selected?.id && isTimelineActivity(activity),
  );
  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;
  const owner = selected && users.find((u) => u.id === selected.ownerId);
  const selectedContacts = mergeContactProfiles(selected?.contacts)
    .filter((contact) => contact.name.trim() || contact.email.trim() || contact.phone.trim()
      || contact.whatsapp?.trim() || contact.telegram?.trim());

  const updateOrganizationPrimaryContact = (
    client: Client,
    name: string,
    email: string,
    phone: string,
    role: string,
  ) => {
    if (!name && !email && !phone) return;
    const existing = findMatchingContactProfile(client.contacts, {
      id: '',
      email,
      phone,
    }) ?? client.contacts?.find((contact) => name && contact.name.trim().toLowerCase() === name.toLowerCase());
    const linkedDealIds = deals.filter((deal) => (deal.clientId === client.id
      || deal.client.trim().toLowerCase() === client.name.trim().toLowerCase())
      && (deal.contactProfileId === existing?.id
        || (email && deal.contactEmail?.trim().toLowerCase() === email.toLowerCase())
        || (name && deal.contactName?.trim().toLowerCase() === name.toLowerCase())))
      .map((deal) => deal.id);
    const profile: CompanyContactProfile = {
      id: existing?.id ?? `contact-${crypto.randomUUID()}`,
      name: name || existing?.name || '',
      role: role || existing?.role || 'Decision Maker',
      email: email || existing?.email || '',
      phone: phone || existing?.phone || '',
      whatsapp: phone || existing?.whatsapp || '',
      telegram: existing?.telegram ?? '',
      linkedLeadIds: existing?.linkedLeadIds ?? [],
      linkedDealIds: [...new Set([...(existing?.linkedDealIds ?? []), ...linkedDealIds])],
    };
    const updatedContacts = mergeContactProfiles(client.contacts, [profile]);
    setLeads((current) => current.map((lead) => {
      const belongsToClient = lead.clientId === client.id
        || lead.client.trim().toLowerCase() === client.name.trim().toLowerCase();
      const matchingContact = lead.contacts?.find((contact) =>
        contact.id === existing?.id
        || (profile.email && contact.email.trim().toLowerCase() === profile.email.toLowerCase())
        || (profile.phone && contact.phone.replace(/\D/g, '') === profile.phone.replace(/\D/g, '')));
      const isPrimary = Boolean(lead.contactProfileId === matchingContact?.id
        || lead.contactProfileId === existing?.id
        || (profile.email && lead.contactEmail?.trim().toLowerCase() === profile.email.toLowerCase())
        || (profile.phone && lead.contactPhone?.replace(/\D/g, '') === profile.phone.replace(/\D/g, ''))
        || (existing && lead.contact.trim().toLowerCase() === existing.name.trim().toLowerCase()));
      if (!belongsToClient || (!matchingContact && !isPrimary)) return lead;
      const linkedProfile = linkContactProfile({
        ...(matchingContact ?? {}),
        ...profile,
        id: matchingContact?.id ?? profile.id,
        linkedLeadIds: [...new Set([...(matchingContact?.linkedLeadIds ?? []), ...(profile.linkedLeadIds ?? [])])],
        linkedDealIds: [...new Set([...(matchingContact?.linkedDealIds ?? []), ...(profile.linkedDealIds ?? [])])],
      }, lead.id, lead.dealId);
      return {
        ...lead,
        contacts: mergeContactProfiles(lead.contacts, [linkedProfile]),
        ...(isPrimary ? {
          contact: profile.name,
          contactProfileId: linkedProfile.id,
          contactRole: profile.role,
          contactEmail: profile.email,
          contactPhone: profile.phone,
          whatsapp: profile.whatsapp,
          telegram: profile.telegram,
        } : {}),
      };
    }));
    setDeals((current) => current.map((deal) => {
      const belongsToClient = deal.clientId === client.id
        || deal.client.trim().toLowerCase() === client.name.trim().toLowerCase();
      const isPrimary = deal.contactProfileId === existing?.id
        || (profile.email && deal.contactEmail?.trim().toLowerCase() === profile.email.toLowerCase())
        || (profile.phone && deal.contactPhone?.replace(/\D/g, '') === profile.phone.replace(/\D/g, ''))
        || (existing && deal.contactName?.trim().toLowerCase() === existing.name.trim().toLowerCase());
      return !belongsToClient || !isPrimary ? deal : {
        ...deal,
        contactProfileId: profile.id,
        contactName: profile.name,
        contactRole: profile.role,
        contactEmail: profile.email,
        contactPhone: profile.phone,
        whatsapp: profile.whatsapp,
        telegram: profile.telegram,
      };
    }));
    setClients((current) => current.map((record) => record.id === client.id
      ? { ...record, contacts: updatedContacts }
      : record));
  };

  const getClientStatus = (client: Client): ClientStatus => {
    if (!hasCompleteClientProfile(client)) return 'Info incomplete';
    if (client.accountStatus === 'draft') return 'Draft';
    const expiry = Date.parse(client.expiry);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const renewalLimit = new Date(now);
    renewalLimit.setMonth(renewalLimit.getMonth() + 3);
    return Number.isFinite(expiry) && expiry >= now.getTime() && expiry <= renewalLimit.getTime() ? 'Renewal Due' : 'Active';
  };
  const searchTerm = query.trim().toLowerCase();
  const filtered = visibleClients.filter((client) => {
    const contactName = client.contactPerson || client.insuredEntity?.primaryStakeholder.fullName || '';
    const matchesSearch = !searchTerm || [
      client.name, client.tin, client.email, contactName, client.phone,
      ...(client.contacts ?? []).flatMap((contact) => [contact.name, contact.email, contact.phone, contact.role]),
    ].some((value) => value.toLowerCase().includes(searchTerm));
    return matchesSearch
      && (!insuranceFilter || client.productCode === insuranceFilter || client.class === insuranceFilter)
      && (!ownerFilter || client.ownerId === ownerFilter)
      && (!statusFilter || getClientStatus(client) === statusFilter)
      && (!countryFilter || client.country === countryFilter);
  });
  const sortedClients = [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const filterActiveCount = [insuranceFilter, ownerFilter, statusFilter, countryFilter].filter(Boolean).length;
  const insuranceOptions = [...new Set(visibleClients.map((client) => client.productCode).filter(Boolean))].sort();
  const countryOptions = [...new Set(visibleClients.map((client) => client.country).filter(Boolean))].sort();
  const peopleRows = useMemo(() => getPeopleDirectoryRows(sortedClients), [sortedClients]);
  const allPeopleRows = useMemo(() => getPeopleDirectoryRows(visibleClients), [visibleClients]);
  const organizationRows = useMemo<OrganizationDirectoryRow[]>(() => {
    const customers = sortedClients.map((client) => ({
      id: `client:${client.id}`,
      name: client.name,
      type: client.tags.some((tag) => tag.trim().toLowerCase() === 'partner') ? 'Partner' as const : 'Customer' as const,
      domain: emailDomain(client.email),
      phone: client.phone,
      client,
    }));
    const hasCustomerFilters = Boolean(insuranceFilter || ownerFilter || statusFilter || countryFilter);
    const suppliers = user.role === 'client' || hasCustomerFilters ? [] : vendors
      .filter((vendor) => !searchTerm || [vendor.name, vendor.email ?? '', vendor.phone ?? ''].some((value) => value.toLowerCase().includes(searchTerm)))
      .map((vendor) => ({
        id: `vendor:${vendor.id}`,
        name: vendor.name,
        type: 'Supplier' as const,
        domain: emailDomain(vendor.email),
        phone: vendor.phone ?? '',
        vendor,
      }));
    return [...customers, ...suppliers]
      .filter((organization) => organizationTypeFilter === 'all' || organization.type === organizationTypeFilter)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [countryFilter, insuranceFilter, organizationTypeFilter, ownerFilter, searchTerm, sortedClients, statusFilter, user.role, vendors]);
  const directoryCount = directoryTab === 'people' ? peopleRows.length : organizationRows.length;
  const peopleGroupLabels = [...new Set(allPeopleRows.map((person) =>
    (peopleGroupBy === 'role' ? person.title : person.client.name).trim() || 'Unspecified',
  ))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  const peopleGroups = peopleGroupLabels.map((label) => ({
    label,
    people: peopleRows.filter((person) =>
      ((peopleGroupBy === 'role' ? person.title : person.client.name).trim() || 'Unspecified') === label),
  }));
  const organizationGroupValue = (organization: OrganizationDirectoryRow) => {
    if (organizationGroupBy === 'status') return organization.client ? getClientStatus(organization.client) : 'Supplier';
    if (organizationGroupBy === 'type') return organization.type;
    return organization.client?.country || organization.vendor?.country || 'Unspecified';
  };
  const organizationGroupLabels = organizationGroupBy === 'status'
    ? ['Active', 'Draft', 'Renewal Due', 'Info incomplete', 'Supplier']
    : organizationGroupBy === 'type'
      ? ['Customer', 'Supplier', 'Partner']
      : [...new Set([
        ...visibleClients.map((client) => client.country || 'Unspecified'),
        ...(user.role === 'client' ? [] : vendors.map((vendor) => vendor.country || 'Unspecified')),
      ])]
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  const organizationGroups = organizationGroupLabels.map((label) => ({
    label,
    organizations: organizationRows.filter((organization) => organizationGroupValue(organization) === label),
  }));
  const linkedDealsForPerson = (person: PersonDirectoryRow) => {
    const profileId = person.id.slice(person.client.id.length + 1);
    const profile = person.client.contacts?.find((contact) => contact.id === profileId);
    const linkedIds = new Set(profile?.linkedDealIds ?? []);
    deals.filter((deal) => {
      const belongsToClient = deal.clientId === person.client.id
        || deal.client.trim().toLowerCase() === person.client.name.trim().toLowerCase();
      const belongsToContact = (profile && deal.contactProfileId === profile.id)
        || (person.email && deal.contactEmail?.trim().toLowerCase() === person.email.trim().toLowerCase())
        || (person.name && deal.contactName?.trim().toLowerCase() === person.name.trim().toLowerCase());
      return belongsToClient && belongsToContact;
    }).forEach((deal) => linkedIds.add(deal.id));
    return linkedIds.size;
  };
  const linkedDealsForOrganization = (organization: OrganizationDirectoryRow) => organization.client
    ? deals.filter((deal) => deal.clientId === organization.client?.id
      || deal.client.trim().toLowerCase() === organization.name.trim().toLowerCase()).length
    : organization.vendor
      ? deals.filter((deal) => deal.vendorId === organization.vendor?.id
        || deal.insurer.trim().toLowerCase() === organization.name.trim().toLowerCase()).length
      : 0;
  const openClient = (client: Client, trigger: HTMLElement) => {
    drawerTriggerRef.current = trigger;
    setSelectedId(client.id);
  };
  const renderClientActions = (client: Client) => {
    const menuOpen = actionMenu?.id === client.id
      && Boolean(actionMenu.anchor.closest('table[aria-label="Organizations"]'));
    return <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label={`Actions for ${client.name}`} aria-haspopup="menu" aria-expanded={menuOpen}
        className="btn-ghost !p-1.5" onClick={(event) => setActionMenu(actionMenu?.id === client.id ? null : { id: client.id, anchor: event.currentTarget })}>
        <MoreHorizontal size={15} />
      </button>
      <TableRowActionsMenu open={menuOpen} anchor={actionMenu?.id === client.id ? actionMenu.anchor : null} label={`${client.name} actions`}>
        {(user.role === 'admin' || user.role === 'client') && <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { setIsPortalEdit(user.role === 'client'); setEditingClient(client); setActionMenu(null); }}><Pencil size={13} /> {user.role === 'client' ? 'Edit My Profile' : 'Edit Client'}</button>}
        {user.role !== 'client' && <button type="button" role="menuitem" className="table-row-actions-item" onClick={() => { setActivityClientId(client.id); setActivityOpen(true); setActionMenu(null); }}><Plus size={13} /> Log Activity</button>}
        {user.role === 'admin' && <button type="button" role="menuitem" className="table-row-actions-item text-hot" onClick={() => { deleteClient(client); setActionMenu(null); }}><Trash2 size={13} /> Delete Client</button>}
      </TableRowActionsMenu>
    </span>;
  };
  const createClient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const client: Client = {
      id: crypto.randomUUID(),
      name: String(data.get('name') ?? '').trim(),
      tin: String(data.get('tin') ?? '').trim(),
      country: String(data.get('country') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      address: '',
      contactPerson: '',
      sumInsured: 0,
      premium: 0,
      expiry: '',
      insurer: '',
      productCode: '',
      class: 'Miscellaneous',
      ownerId: user.id,
      tags: [INCOMPLETE_COMPANY_TAG],
      accountStatus: 'draft',
    };
    setClients((current) => [client, ...current]);
    setCreateOpen(false);
    setSelectedId(client.id);
  };
  const deleteClient = (client: Client) => {
    if (user.role !== 'admin') return;
    const linkedLeads = leads.filter((lead) => lead.clientId === client.id
      || lead.client.trim().toLowerCase() === client.name.trim().toLowerCase());
    const linkedDeals = deals.filter((deal) => deal.clientId === client.id
      || deal.client.trim().toLowerCase() === client.name.trim().toLowerCase());
    const linkedInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
    if (linkedLeads.length || linkedDeals.length || linkedInvoices.length) {
      setDeleteBlockedMessage(`Cannot delete "${client.name}" because it has ${linkedLeads.length + linkedDeals.length + linkedInvoices.length} associated record(s). Reassign or delete all linked Leads, Deals, and Invoices first.`);
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
      updateOrganizationPrimaryContact(
        editingClient,
        contactPerson,
        email,
        phone,
        editingClient.insuredEntity?.primaryStakeholder.designation ?? 'Decision Maker',
      );
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
      updateOrganizationPrimaryContact(
        editingClient,
        contactPerson,
        email,
        phone,
        read('stakeholderDesignation', existingDetails?.primaryStakeholder.designation ?? 'Decision Maker'),
      );
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
    if (!activityClient) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const now = new Date().toISOString();
    const activity: Activity = {
      id: `a-${Date.now()}`,
      clientId: activityClient.id,
      type,
      title: String(data.get('title')).trim(),
      description,
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    };
    setActivities([activity, ...activities]);
    setActivityOpen(false);
  };

  return (
    <div className="space-y-3">
      <PageToolbar name="clients" className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Client directory" className="inline-flex items-center gap-1 rounded-lg border border-[#1B1E22] bg-[#0B0C0E] p-0.5">
            {([
              ['people', 'People'],
              ['organizations', 'Organizations'],
            ] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={directoryTab === tab}
              onClick={() => setDirectoryTab(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${directoryTab === tab ? 'bg-[#1B1E22] text-white' : 'text-muted hover:text-white'}`}>{label}</button>)}
          </div>
          <ViewModeSwitcher label="Client views" value={view} onChange={setView} options={[
            { value: 'list', label: 'List view', Icon: List },
            { value: 'kanban', label: 'Board view', Icon: Columns3 },
          ]} />
          {(user.role === 'admin' || user.role === 'sales') && <>
            <button type="button" className="btn-primary !py-2" onClick={() => setCreateOpen(true)}><Plus size={14} /> Client</button>
            <a className="btn-ghost !py-2 no-underline" href="#/leads"><Plus size={14} /> Add through Lead</a>
          </>}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Badge variant="brand"><span className="font-semibold">{directoryCount}</span> {directoryTab === 'people' ? (directoryCount === 1 ? 'person' : 'people') : (directoryCount === 1 ? 'organization' : 'organizations')}</Badge>
          <label className="relative w-full max-w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={directoryTab === 'people' ? 'Search people' : 'Search organizations'} aria-label={directoryTab === 'people' ? 'Search people' : 'Search organizations'} className="input !py-1.5 pl-9 !text-xs" />
          </label>
          <button type="button" className="btn-ghost !py-1.5" aria-label={`Filter ${directoryTab === 'people' ? 'people' : 'organizations'}`} onClick={() => setFilterOpen(true)}>
            <Filter size={14} /> Filter{filterActiveCount > 0 && <Badge variant="brand" compact>{filterActiveCount}</Badge>}
          </button>
        </div>
        </PageToolbar>

        {directoryTab === 'organizations' && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter organizations by type">
          {([
            ['all', 'All'],
            ['Customer', 'Customer'],
            ['Supplier', 'Supplier'],
            ['Partner', 'Partner'],
          ] as const).map(([type, label]) => <button key={type} type="button" aria-pressed={organizationTypeFilter === type}
            onClick={() => setOrganizationTypeFilter(type)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${organizationTypeFilter === type ? 'border-brand-400/40 bg-brand-400/10 text-brand-200' : 'border-ink-700 bg-ink-900/40 text-muted hover:text-white'}`}>{label}</button>)}
        </div>}

        {view === 'kanban' && <div className="flex min-w-0 justify-end">
          <label className="flex min-w-0 items-center gap-2 text-xs text-muted">Group by
            {directoryTab === 'people'
              ? <select aria-label="Group people by" className="input !w-auto max-w-full !py-1.5 !text-xs" value={peopleGroupBy} onChange={(event) => setPeopleGroupBy(event.target.value as PeopleGroupBy)}>
                <option value="role">Role</option><option value="organization">Organization</option>
              </select>
              : <select aria-label="Group organizations by" className="input !w-auto max-w-full !py-1.5 !text-xs" value={organizationGroupBy} onChange={(event) => setOrganizationGroupBy(event.target.value as OrganizationGroupBy)}>
                <option value="status">Account status</option><option value="type">Type</option><option value="country">Country</option>
              </select>}
          </label>
        </div>}

        {view === 'list' ? (directoryTab === 'people' ? (
          <TableShell className="max-h-[calc(100vh-12rem)] overflow-auto">
            {!dataReady ? <div role="status" aria-label="Loading people" className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-md bg-ink-800/80" />)}
            </div> : <table aria-label="People" className="w-full min-w-[640px] leading-tight">
              <thead className="sticky top-0 z-10 bg-[#111214] font-semibold text-[#D0D3D9]">
                <tr>{['Name', 'Email', 'Phone', 'Title'].map((label) => <th key={label} scope="col" className="border-b border-[#1B1E22] px-1 py-2 text-left">{label}</th>)}</tr>
              </thead>
              <tbody>
                {peopleRows.map((person) => <tr key={person.id} tabIndex={0} aria-label={`Open contact ${person.name}`}
                  onClick={(event) => openClient(person.client, event.currentTarget)}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                      event.preventDefault();
                      openClient(person.client, event.currentTarget);
                    }
                  }}
                  className="cursor-pointer border-b border-[#1B1E22] text-[#D0D3D9] transition hover:bg-[#111214] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                  <td data-label="Name" className="px-2 py-2 font-medium text-white">{person.name}</td>
                  <td data-label="Email" className="px-2 py-2"><span className="block truncate" title={person.email}>{person.email || '—'}</span></td>
                  <td data-label="Phone" className="whitespace-nowrap px-2 py-2">{person.phone || '—'}</td>
                  <td data-label="Title" className="px-2 py-2">{person.title || '—'}</td>
                </tr>)}
                {peopleRows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-sm text-muted">{dataReady ? 'No people match your search or filters.' : 'Loading people…'}</td></tr>}
              </tbody>
            </table>}
          </TableShell>
        ) : (
          <TableShell className="max-h-[calc(100vh-12rem)] overflow-auto">
            {!dataReady ? <div role="status" aria-label="Loading organizations" className="space-y-2 p-3">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-md bg-ink-800/80" />)}
            </div> : <table aria-label="Organizations" className="w-full min-w-[720px] leading-tight">
              <thead className="sticky top-0 z-10 bg-[#111214] font-semibold text-[#D0D3D9]">
                <tr>{['Name', 'Type', 'Domain', 'Phone', 'Actions'].map((label) => <th key={label} scope="col" className={`border-b border-[#1B1E22] px-1 py-2 ${label === 'Actions' ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr>
              </thead>
              <tbody>
                {organizationRows.map((organization) => {
                  const client = organization.client;
                  return <tr key={organization.id} tabIndex={client ? 0 : undefined}
                  aria-label={client ? `Open ${organization.name}` : undefined}
                  onClick={client ? (event) => openClient(client, event.currentTarget) : undefined}
                  onKeyDown={client ? (event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                      event.preventDefault();
                      openClient(client, event.currentTarget);
                    }
                  } : undefined}
                  className={`border-b border-[#1B1E22] text-[#D0D3D9] transition hover:bg-[#111214] ${client ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400' : ''}`}>
                  <td data-label="Name" className="px-2 py-2 font-medium text-white">
                    <span className="min-w-0 break-words">{organization.name}</span>
                  </td>
                  <td data-label="Type" className="px-2 py-2">
                    <Badge variant={organization.type === 'Customer' ? 'brand' : organization.type === 'Supplier' ? 'muted' : 'warm'} subtle>{organization.type.toUpperCase()}</Badge>
                  </td>
                  <td data-label="Domain" className="px-2 py-2"><span className="block truncate" title={organization.domain}>{organization.domain || '—'}</span></td>
                  <td data-label="Phone" className="whitespace-nowrap px-2 py-2">{organization.phone || '—'}</td>
                  <td data-label="Actions" className="px-1 py-2 text-right">{client ? renderClientActions(client) : null}</td>
                </tr>;
                })}
                {organizationRows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted">{dataReady ? 'No organizations match your search or filters.' : 'Loading organizations…'}</td></tr>}
              </tbody>
            </table>}
          </TableShell>
        )) : (directoryTab === 'people' ? (
          !dataReady ? <div role="status" aria-label="Loading people" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-xl border border-ink-700 bg-ink-800/80" />)}
          </div> : peopleGroupLabels.length === 0
            ? <div className="rounded-xl border border-ink-700 bg-ink-950 px-4 py-12 text-center text-sm text-muted">No people match your search or filters.</div>
            : <KanbanBoard ariaLabel={`People grouped by ${peopleGroupBy}`} testId="people-board">
              {peopleGroups.map((group) => <KanbanColumn
                key={group.label}
                name={group.label}
                count={group.people.length}
                summary={`${group.people.length} ${group.people.length === 1 ? 'person' : 'people'}`}
                emptyLabel="people"
                testId="people-kanban-column"
              >
                {group.people.map((person) => <KanbanCard
                  key={person.id}
                  testId="people-kanban-card"
                  ariaLabel={`Open contact ${person.name}`}
                  pills={[<KanbanPill tone="muted">{person.title || 'Unspecified role'}</KanbanPill>]}
                  meta={person.client.name}
                  metaTitle={person.email ? `${person.client.name} · ${person.email}` : person.client.name}
                  title={person.name}
                  titleTitle={person.name}
                  footerLeft={person.phone || 'No phone'}
                  footerRight={`${linkedDealsForPerson(person)} linked deals`}
                  onActivate={(card) => openClient(person.client, card)}
                />)}
              </KanbanColumn>)}
            </KanbanBoard>
        ) : (
          !dataReady ? <div role="status" aria-label="Loading organizations" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-xl border border-ink-700 bg-ink-800/80" />)}
          </div> : organizationGroupLabels.length === 0
            ? <div className="rounded-xl border border-ink-700 bg-ink-950 px-4 py-12 text-center text-sm text-muted">No organizations match your search or filters.</div>
            : <KanbanBoard ariaLabel="Organizations grouped by account status" testId="clients-kanban-board">
              {organizationGroups.map((group) => {
                const noun = group.label === 'Supplier' ? 'supplier' : group.label === 'Partner' ? 'partner' : 'customer';
                const summaryNoun = organizationGroupBy === 'status'
                  ? noun
                  : organizationGroupBy === 'type' ? group.label.toLowerCase().replace(/s$/, '') : 'organization';
                return <KanbanColumn
                  key={group.label}
                  name={group.label}
                  count={group.organizations.length}
                  summary={`${group.organizations.length} ${summaryNoun}${group.organizations.length === 1 ? '' : 's'}`}
                  emptyLabel={summaryNoun === 'customer' ? 'customers' : `${summaryNoun}s`}
                  testId="clients-kanban-column"
                >
                  {group.organizations.map((organization) => {
                    const status = organization.client ? getClientStatus(organization.client) : 'Supplier';
                    const statusTone = status === 'Active' ? 'green' : status === 'Info incomplete' ? 'red' : 'amber';
                    const statusPill = <KanbanPill tone={statusTone}>{status}</KanbanPill>;
                    const typePill = <KanbanPill tone={organization.type === 'Customer' ? 'blue' : organization.type === 'Supplier' ? 'muted' : 'purple'}>{organization.type}</KanbanPill>;
                    return <KanbanCard
                      key={organization.id}
                      testId="organization-kanban-card"
                      ariaLabel={organization.client ? `Open ${organization.name}` : organization.name}
                      pills={[statusPill, typePill]}
                      meta={organization.domain || organization.client?.country || organization.vendor?.country || 'No organization detail'}
                      metaTitle={organization.domain || organization.client?.country || organization.vendor?.country || 'No organization detail'}
                      title={organization.name}
                      titleTitle={organization.name}
                      footerLeft={organization.phone || 'No phone'}
                      footerRight={`${linkedDealsForOrganization(organization)} linked deals`}
                      onActivate={(card) => {
                        if (organization.client) openClient(organization.client, card);
                      }}
                    />;
                  })}
                </KanbanColumn>;
              })}
            </KanbanBoard>
        ))}

      {selected && <div className="fixed inset-0 z-[70] flex justify-end" role="presentation">
        <button type="button" aria-label="Close client details" className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
        <aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="client-drawer-title" className="client-drawer-enter relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-ink-600 bg-ink-950 shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-ink-700 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white">{avatarCode(selected.name)}</div>
              <div className="min-w-0">
                <h2 id="client-drawer-title" className="break-words text-lg font-bold text-white">{selected.name}</h2>
                <div className="mt-0.5 text-sm text-muted">{[selected.tin && `TIN: ${selected.tin}`, selected.country].filter(Boolean).join(' · ')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="brand" dot>{selected.class}</Badge>
                  <Badge variant={getClientStatus(selected) === 'Active' ? 'win' : 'warm'}>{getClientStatus(selected) === 'Info incomplete' ? INCOMPLETE_COMPANY_TAG : getClientStatus(selected)}</Badge>
                  <Badge variant="muted">{productName(selected.productCode)}</Badge>
                  {selected.tags.filter((tag) => tag !== INCOMPLETE_COMPANY_TAG).map((tag) => <Badge key={tag} variant="win">{tag}</Badge>)}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {user.role === 'admin' && <>
                <button type="button" className="btn-ghost !py-2" onClick={() => { setIsPortalEdit(false); setEditingClient(selected); }}><Pencil size={14} /> Edit Client</button>
                <button type="button" className="btn-ghost !py-2 text-hot" onClick={() => deleteClient(selected)}><Trash2 size={14} /> Delete Client</button>
              </>}
              {user.role === 'client' && <button type="button" className="btn-primary !py-2" onClick={() => { setProfileError(''); setIsPortalEdit(true); setEditingClient(selected); }}><Pencil size={14} /> Edit My Profile</button>}
              {user.role !== 'client' && <>
                <button type="button" className="btn-primary !py-2" onClick={() => { setActivityClientId(selected.id); setActivityOpen(true); }}><Plus size={14} /> Log Activity</button>
              </>}
              <button ref={drawerCloseRef} type="button" aria-label="Close client details" className="btn-ghost !p-2" onClick={closeDrawer}><X size={16} /></button>
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="glass rounded-2xl p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><Building2 size={16} /> Client Information</h3>
                <div className="space-y-2 text-sm">
                  <InfoRow icon={Phone} label="Phone" value={selected.phone} />
                  <InfoRow icon={Mail} label="Email" value={selected.email} />
                  <InfoRow icon={MapPin} label="Address" value={selected.address} />
                  <InfoRow icon={Briefcase} label="Contact Person" value={selected.contactPerson || selected.insuredEntity?.primaryStakeholder.fullName} />
                  <InfoRow icon={Briefcase} label="Account Owner" value={owner?.name ?? formatStaffIdentifier(selected.ownerId)} />
                </div>
                {selectedContacts.length > 0 && <div className="mt-3 border-t border-ink-700 pt-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Company Contacts</h4>
                  <div className="space-y-1.5">{selectedContacts.map((contact) => <div key={contact.id} className="rounded-lg border border-ink-700 bg-ink-900/40 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words font-medium text-white">{contact.name}</span><Badge variant="muted">{contact.role}</Badge></div>
                    {(contact.email || contact.phone) && <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-white">{contact.email && <span className="break-all">{contact.email}</span>}{contact.phone && <span className="break-all">{contact.phone}</span>}</div>}
                  </div>)}</div>
                </div>}
              </div>
              <div className="glass rounded-2xl p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold text-white"><ShieldCheck size={16} /> Policy Details</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Sum Insured" value={selected.sumInsured > 0 ? `MVR ${selected.sumInsured.toLocaleString()}` : ''} />
                  <Metric label="Premium" value={selected.premium > 0 ? `MVR ${selected.premium.toLocaleString()}` : ''} />
                  <Metric label="Expiry" value={formatDate(selected.expiry)} />
                  <Metric label="Insurer" value={selected.insurer} />
                  <Metric label="Class" value={selected.class !== 'Miscellaneous' ? selected.class : ''} />
                  <Metric label="Product" value={selected.productCode ? `${selected.productCode} · ${productName(selected.productCode)}` : ''} />
                </div>
              </div>
            </div>
            <div className="glass flex min-h-64 flex-col rounded-2xl p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Calendar size={16} /> Activity Timeline</h3>
              <div className="flex-1 overflow-y-auto">
                {clientActivities.map((activity) => <ActivityTimelineItem key={activity.id} title={activity.title} description={activity.description} date={activity.date} category={activity.type} />)}
                {clientActivities.length === 0 && <div className="py-8 text-center text-sm text-muted">No activity yet</div>}
              </div>
            </div>
          </div>
        </aside>
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
                    <Field label="Tags (comma-separated)"><input className="input" name="tags" list="shared-client-tags" defaultValue={editingClient.tags.join(', ')} />
                      <datalist id="shared-client-tags">{settingsCatalogs.tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
                    </Field>
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
            <Modal
              open={Boolean(deleteBlockedMessage)}
              onClose={() => setDeleteBlockedMessage('')}
              title="Client can’t be deleted"
              size="sm"
              footer={<button type="button" className="btn-primary" onClick={() => setDeleteBlockedMessage('')}>Understood</button>}
            >
              <p role="alert" className="text-sm leading-relaxed text-muted">{deleteBlockedMessage}</p>
            </Modal>
            <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Log Activity" subtitle={activityClient?.name} footer={<><button type="button" className="btn-ghost" onClick={() => setActivityOpen(false)}>Cancel</button><button type="submit" form="new-activity-form" className="btn-primary">Save Activity</button></>}>
              <form id="new-activity-form" onSubmit={(event) => addActivity(event, (new FormData(event.currentTarget).get('type') as Activity['type']))} className="space-y-3">
                <Field label="Activity type"><select className="input" name="type"><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="note">Note</option><option value="task">Task</option><option value="upload">Upload</option></select></Field>
                <Field label="Title"><input className="input" name="title" required /></Field>
                <Field label="Details"><textarea className="input min-h-24" name="description" required /></Field>
              </form>
            </Modal>
            <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Client" subtitle="Create a draft client profile." footer={<><button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" form="new-client-form" className="btn-primary">Create Client</button></>}>
              <form id="new-client-form" onSubmit={createClient} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Client name"><input className="input" name="name" required autoFocus /></Field>
                <Field label="TIN"><input className="input" name="tin" /></Field>
                <Field label="Country / Location"><input className="input" name="country" defaultValue="Maldives" /></Field>
                <Field label="Phone"><input className="input" name="phone" type="tel" /></Field>
                <Field label="Email"><input className="input" name="email" type="email" /></Field>
              </form>
            </Modal>
            <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Clients" subtitle="Filter by insurance type, owner, status, or country." footer={<><button type="button" className="btn-ghost" onClick={() => { setInsuranceFilter(''); setOwnerFilter(''); setStatusFilter(''); setCountryFilter(''); }}>Clear filters</button><button type="button" className="btn-primary" onClick={() => setFilterOpen(false)}>Show {filtered.length} clients</button></>}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Insurance Type"><select className="input" value={insuranceFilter} onChange={(event) => setInsuranceFilter(event.target.value)}><option value="">All insurance types</option>{insuranceOptions.map((option) => <option key={option} value={option}>{option} · {productName(option)}</option>)}{[...new Set(visibleClients.map((client) => client.class).filter(Boolean))].sort().map((option) => <option key={`class-${option}`} value={option}>{option}</option>)}</select></Field>
                <Field label="Account Owner"><select className="input" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">All owners</option>{[...new Map(visibleClients.map((client) => [client.ownerId, users.find((item) => item.id === client.ownerId)?.name ?? formatStaffIdentifier(client.ownerId)])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
                <Field label="Status"><select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ClientStatus | '')}><option value="">All statuses</option><option value="Active">Active</option><option value="Draft">Draft</option><option value="Renewal Due">Renewal Due</option><option value="Info incomplete">Info incomplete</option></select></Field>
                <Field label="Country"><select className="input" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="">All countries</option>{countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}</select></Field>
              </div>
            </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}

function InfoRow({ icon: Icon, label, value }: { icon:  typeof Phone; label: string; value?: string }) {
  const displayValue = value?.trim();
  if (!displayValue || displayValue === '—' || displayValue === '-') return null;
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted">{label}</div>
        <div className="text-white text-sm break-words">{displayValue}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  if (!value.trim() || value === '—' || value === '-' || value.toLowerCase() === 'not assigned') return null;
  return (
    <div className="bg-ink-900/50 rounded-lg p-3">
      <div className="text-[11px] text-muted mb-1">{label}</div>
      <div className="text-white text-sm font-medium">{value}</div>
    </div>
  );
}
