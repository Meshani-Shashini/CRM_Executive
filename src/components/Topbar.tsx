import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Search, Bell, ChevronDown, LogOut, Building2, UserRound, Receipt, AlertTriangle, CalendarDays, Check } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Role } from '../types';
import { calculateLeadContactSla, getContactMadeSlaTargetDays } from '../utils/leadSla';
import { isTerminalLeadStage, lifecycleStageForLead } from '../utils/leadLifecycle';

const roleLabel: Record<Role, string> = {
  admin: 'System Admin',
  sales: 'Sales',
  finance: 'Accountant',
  client: 'Client',
};

const titles: Record<string, string> = {
  dashboard: 'Executive Dashboard',
  plans: 'My Plans',
  leads: 'Leads',
  deals: 'Deals',
  clients: 'Clients',
  calendar: 'Calendar',
  reports: 'Reports',
  documents: 'Documents',
  quotations: 'Quotations',
  qslips: 'Quotation Request Slips',
  'internal-slips': 'Internal Slips',
  invoices: 'Invoices',
  payments: 'Payments',
  'pay-requests': 'Payment Requests',
  renewals: 'Renewals',
  'info-requests': 'Info Requests',
  'rate-cards': 'Commission Rate Cards',
  settings: 'System Settings',
  funnels: 'Funnels',
  pipelines: 'Pipelines',
  targets: 'Targets',
  'audit-log': 'Audit Log',
  mira: 'MIRA Form 1 — Business Written',
};

type SearchResult = {
  id: string;
  type: 'Client' | 'Lead' | 'Invoice';
  title: string;
  detail: string;
  href: string;
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  kind: 'renewal' | 'lead' | 'invoice';
  href: string;
};

export default function Topbar({
  page, onMenu,
}: {
  page: string;
  onMenu: () => void;
}) {
  const {
    user, viewAsRole, setViewAsRole, signOut, clients, leads, invoices,
    users, pipelineStages,
  } = useApp();
  const canPreviewRoles = user.role === 'admin';
  const activeRole = viewAsRole ?? user.role;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchTerm = searchQuery.trim().toLowerCase();
  const canSearchClients = ['admin', 'sales', 'finance', 'client'].includes(activeRole);
  const visibleClients = useMemo(() => canSearchClients
    ? clients.filter((client) => client.accountStatus !== 'draft'
      && (activeRole !== 'client' || client.id === user.clientId))
    : [], [activeRole, canSearchClients, clients, user.clientId]);
  const visibleLeads = useMemo(() => activeRole === 'admin'
    ? leads.filter((lead) => lead.status !== 'COMPLETED' && !lead.disposition
      && !isTerminalLeadStage(lifecycleStageForLead(lead, Boolean(lead.dealId))))
    : activeRole === 'sales'
      ? leads.filter((lead) => lead.ownerId === user.id && lead.status !== 'COMPLETED' && !lead.disposition
        && !isTerminalLeadStage(lifecycleStageForLead(lead, Boolean(lead.dealId))))
      : [], [activeRole, leads, user.id]);
  const visibleInvoices = useMemo(() => activeRole === 'admin' || activeRole === 'finance'
    ? invoices.filter((invoice) => invoice.status !== 'Archived')
    : activeRole === 'client'
      ? invoices.filter((invoice) => invoice.clientId === user.clientId && invoice.status !== 'Archived')
      : [], [activeRole, invoices, user.clientId]);
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const match = (fields: string[]) => fields.some((field) => field.toLowerCase().includes(searchTerm));
    const clientsFound: SearchResult[] = visibleClients
      .filter((client) => match([client.name, client.email, client.phone, client.insurer]))
      .map((client) => ({
        id: `client:${client.id}`,
        type: 'Client',
        title: client.name,
        detail: [client.insurer, client.expiry ? `Renewal ${formatShortDate(client.expiry)}` : ''].filter(Boolean).join(' · '),
        href: `#/clients?id=${encodeURIComponent(client.id)}`,
      }));
    const leadsFound: SearchResult[] = visibleLeads
      .filter((lead) => match([
        lead.title ?? '', lead.client, lead.contact, lead.contactEmail ?? '', lead.contactPhone ?? '',
        lead.productCode, lead.insuranceClass, lead.source ?? '',
        users.find((candidate) => candidate.id === lead.ownerId)?.name ?? '',
      ]))
      .map((lead) => ({
        id: `lead:${lead.id}`,
        type: 'Lead',
        title: lead.title ?? `${lead.client} lead`,
        detail: `${lead.client} · ${lead.funnelStage}`,
        href: `#/leads?id=${encodeURIComponent(lead.id)}`,
      }));
    const invoicesFound: SearchResult[] = visibleInvoices
      .filter((invoice) => match([invoice.number, invoice.clientName, invoice.insurer, invoice.policyNo, invoice.status]))
      .map((invoice) => ({
        id: `invoice:${invoice.id}`,
        type: 'Invoice',
        title: invoice.number,
        detail: `${invoice.clientName} · ${invoice.status}`,
        href: `#/invoices?id=${encodeURIComponent(invoice.id)}`,
      }));
    return [
      ...clientsFound.slice(0, 5),
      ...leadsFound.slice(0, 5),
      ...invoicesFound.slice(0, 5),
    ].slice(0, 10);
  }, [searchTerm, users, visibleClients, visibleLeads, visibleInvoices]);
  const notifications = useMemo(() => {
    const today = new Date(clockNow);
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const dayMilliseconds = 86400000;
    const items: NotificationItem[] = [];
    if (activeRole === 'admin' || activeRole === 'sales' || activeRole === 'client') {
      for (const client of visibleClients) {
        const expiry = Date.parse(client.expiry.length === 10 ? `${client.expiry}T00:00:00Z` : client.expiry);
        if (!Number.isFinite(expiry)) continue;
        const expiryDay = Date.UTC(new Date(expiry).getUTCFullYear(), new Date(expiry).getUTCMonth(), new Date(expiry).getUTCDate());
        const daysUntil = Math.ceil((expiryDay - todayUtc) / dayMilliseconds);
        if (daysUntil < 0 || daysUntil > 30) continue;
        items.push({
          id: `renewal:${client.id}:${client.expiry}`,
          title: `Renewal ${daysUntil === 0 ? 'due today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}`,
          detail: `${client.name} · ${formatShortDate(client.expiry)}`,
          kind: 'renewal',
          href: `#/clients?id=${encodeURIComponent(client.id)}`,
        });
      }
      for (const lead of visibleLeads) {
        const terminal = lead.disposition === 'converted' || lead.disposition === 'lost'
          || isTerminalLeadStage(lifecycleStageForLead(lead, Boolean(lead.dealId)));
        if (terminal) continue;
        const target = getContactMadeSlaTargetDays(lead, pipelineStages);
        const sla = calculateLeadContactSla(lead, target, clockNow);
        if (!sla?.overdue) continue;
        items.push({
          id: `lead-sla:${lead.id}:${sla.createdAt}`,
          title: `Lead SLA overdue by ${sla.overdueDays} day${sla.overdueDays === 1 ? '' : 's'}`,
          detail: lead.title ?? `${lead.client} lead`,
          kind: 'lead',
          href: `#/leads?id=${encodeURIComponent(lead.id)}`,
        });
      }
    }
    if (activeRole === 'admin' || activeRole === 'finance' || activeRole === 'client') {
      for (const invoice of visibleInvoices) {
        if (invoice.status === 'Paid' || invoice.status === 'Archived') continue;
        const hasUnpaidInstallments = invoice.installments.some((installment) => !installment.paid);
        if (!hasUnpaidInstallments && invoice.status !== 'Overdue') continue;
        items.push({
          id: `invoice:${invoice.id}:${invoice.status}`,
          title: invoice.status === 'Overdue' ? 'Invoice payment overdue' : 'Invoice payment pending',
          detail: `${invoice.number} · ${invoice.clientName}`,
          kind: 'invoice',
          href: `#/invoices?status=outstanding&id=${encodeURIComponent(invoice.id)}`,
        });
      }
    }
    return items.sort((left, right) => left.title.localeCompare(right.title));
  }, [activeRole, clockNow, pipelineStages, visibleClients, visibleInvoices, visibleLeads]);
  const unreadCount = notifications.filter((notification) => !readNotificationIds.has(notification.id)).length;

  useEffect(() => {
    const dismissOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
      if (!searchRef.current?.contains(event.target)) setSearchOpen(false);
      if (!notificationRef.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        setNotificationsOpen(false);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (event.key === 'Escape') {
        setProfileOpen(false);
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', dismissOnOutsideClick);
    document.addEventListener('keydown', handleKeyboard);
    return () => {
      document.removeEventListener('mousedown', dismissOnOutsideClick);
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const navigateTo = (href: string) => {
    window.location.hash = href.slice(1);
    setSearchOpen(false);
    setNotificationsOpen(false);
    setSearchQuery('');
  };

  const selectSearchResult = (result: SearchResult) => navigateTo(result.href);
  const selectNotification = (notification: NotificationItem) => {
    setReadNotificationIds((current) => new Set(current).add(notification.id));
    navigateTo(notification.href);
  };

  return (
    <header className="sticky top-0 z-20 bg-ink-900/80 backdrop-blur-xl border-b border-ink-600">
      <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
        <button onClick={onMenu} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-ink-700 text-muted hover:text-white">
          <Menu size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold text-base lg:text-lg truncate">
            {titles[page] ?? 'Dashboard'}
          </h1>
        </div>
        <div className="relative flex min-w-0 max-w-64 flex-1 items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/70 px-3 py-1.5" ref={searchRef}>
          <Search size={14} className="text-muted" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setActiveResult(0);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && searchResults.length) {
                event.preventDefault();
                setActiveResult((current) => (current + 1) % searchResults.length);
              } else if (event.key === 'ArrowUp' && searchResults.length) {
                event.preventDefault();
                setActiveResult((current) => (current - 1 + searchResults.length) % searchResults.length);
              } else if (event.key === 'Enter' && searchOpen && searchResults[activeResult]) {
                event.preventDefault();
                selectSearchResult(searchResults[activeResult]);
              }
            }}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen && Boolean(searchTerm)}
            aria-controls="global-search-results"
            placeholder="Search clients, leads, invoices…"
            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-muted/70 sm:text-sm"
          />
          <kbd className="hidden shrink-0 rounded border border-ink-600 px-1.5 py-0.5 text-[10px] text-muted/70 sm:block">⌘K</kbd>
          {searchOpen && searchTerm && <div id="global-search-results" role="listbox" aria-label="Global search results" className="absolute right-0 top-full z-30 mt-2 max-h-[min(70vh,28rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-ink-600 bg-ink-900 p-1.5 shadow-2xl">
            {searchResults.length ? searchResults.map((result, index) => <button
              key={result.id}
              type="button"
              role="option"
              aria-selected={activeResult === index}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ${activeResult === index ? 'bg-ink-700' : 'hover:bg-ink-800'}`}
              onMouseEnter={() => setActiveResult(index)}
              onClick={() => selectSearchResult(result)}
            >
              <span className="mt-0.5 text-brand-300">{result.type === 'Client' ? <Building2 size={15} /> : result.type === 'Lead' ? <UserRound size={15} /> : <Receipt size={15} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{result.title}</span>
                <span className="block truncate text-[11px] text-muted">{result.type} · {result.detail}</span>
              </span>
            </button>) : <p className="px-3 py-4 text-center text-xs text-muted">No matching clients, leads, or invoices.</p>}
          </div>}
        </div>
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setSearchOpen(false);
            }}
            className="relative rounded-lg p-2 text-muted transition hover:bg-ink-700 hover:text-white"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-hot px-1 text-center text-[9px] font-bold leading-4 text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          {notificationsOpen && <section aria-label="Notifications" className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Notifications</h2>
                <p className="mt-0.5 text-[10px] text-muted">{unreadCount} unread</p>
              </div>
              {unreadCount > 0 && <button type="button" className="text-[10px] text-brand-300 hover:text-white" onClick={() => setReadNotificationIds(new Set(notifications.map((notification) => notification.id)))}>Mark all read</button>}
            </div>
            <div className="max-h-[min(65vh,24rem)] overflow-y-auto p-1.5">
              {notifications.length ? notifications.map((notification) => {
                const unread = !readNotificationIds.has(notification.id);
                const Icon = notification.kind === 'renewal' ? CalendarDays : notification.kind === 'lead' ? AlertTriangle : Receipt;
                return <button key={notification.id} type="button" onClick={() => selectNotification(notification)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-800 ${unread ? 'bg-ink-800/50' : ''}`}>
                  <Icon size={15} className={`mt-0.5 shrink-0 ${notification.kind === 'lead' ? 'text-hot' : notification.kind === 'renewal' ? 'text-warm' : 'text-brand-300'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white">{notification.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{notification.detail}</span>
                  </span>
                  {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-300" aria-label="Unread" />}
                </button>;
              }) : <div className="px-4 py-8 text-center">
                <Check size={18} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-xs text-muted">You’re all caught up.</p>
              </div>}
            </div>
          </section>}
        </div>
        <div className="relative pl-2 border-l border-ink-600" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={`Account menu for ${user.name}`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-700 transition"
          >
            <div className="w-8 h-8 rounded-full bg-[#1E2024] flex items-center justify-center text-xs font-bold text-[#8E95A2]">
              {avatarCode(user.name)}
            </div>
            <div className="hidden sm:block leading-tight text-left">
              <div className="text-sm text-white">{user.name}</div>
              <div className="text-[10px] text-muted">
                {viewAsRole ? `Viewing as ${roleLabel[viewAsRole]}` : user.title}
              </div>
            </div>
            <ChevronDown size={14} className={`text-muted hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileOpen && (
            <div role="menu" aria-label="Account menu" className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-ink-600 bg-ink-900 p-2 shadow-xl">
              <div className="px-3 py-2 border-b border-ink-700">
                <div className="text-sm text-white">{user.name}</div>
                <div className="text-[10px] text-brand-400 mt-1">{roleLabel[activeRole]}</div>
                {viewAsRole && <div className="mt-1 text-[10px] text-warm">View-only role preview</div>}
              </div>
              {canPreviewRoles && (
                <div className="border-b border-ink-700 p-2">
                  <div className="px-1 pb-2 text-[10px] tracking-wider text-muted">View role</div>
                  <div role="group" aria-label="Preview role" className="grid grid-cols-2 gap-1">
                    {([
                      ['admin', 'Admin'],
                      ['sales', 'Sales'],
                      ['finance', 'Finance'],
                      ['client', 'Client'],
                    ] as const).map(([role, label]) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={activeRole === role}
                        onClick={() => {
                          setViewAsRole(role);
                          const route = role === 'finance' ? 'invoices' : role === 'client' ? 'clients' : 'dashboard';
                          window.location.hash = `#/${route}`;
                          setProfileOpen(false);
                        }}
                        className={`rounded-md px-2 py-2 text-xs font-medium transition ${
                          activeRole === role ? 'bg-brand-500 text-white' : 'text-muted hover:bg-ink-700 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {signOutError && <p role="alert" className="px-3 py-2 text-xs text-hot">{signOutError}</p>}
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  try {
                    await signOut();
                  } catch (error) {
                    setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
                  }
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-ink-700 hover:text-white transition"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function avatarCode(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).slice(0, 2).join('') : (parts[0] ?? '').slice(0, 2)).toUpperCase();
}

function formatShortDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : value;
}
