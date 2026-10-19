import { useEffect, useRef, useState } from 'react';
import { Menu, Search, Bell, ChevronDown, LogOut } from 'lucide-react';
import { useApp } from '../store/AppContext';
import type { Role } from '../types';

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

export default function Topbar({
  page, onMenu,
}: {
  page: string;
  onMenu: () => void;
}) {
  const { user, signOut } = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;

    const dismissOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    document.addEventListener('mousedown', dismissOnOutsideClick);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('mousedown', dismissOnOutsideClick);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [profileOpen]);

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
        <div className="hidden md:flex items-center gap-2 bg-ink-800/70 border border-ink-600 rounded-lg px-3 py-1.5 w-64">
          <Search size={14} className="text-muted" />
          <input
            placeholder="Search clients, leads, invoices…"
            className="bg-transparent text-sm text-white placeholder:text-muted/70 outline-none flex-1"
          />
          <kbd className="text-[10px] text-muted/70 border border-ink-600 rounded px-1.5 py-0.5">⌘K</kbd>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-ink-700 text-muted hover:text-white transition">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-hot rounded-full animate-pulseSoft" />
        </button>
        <div className="relative pl-2 border-l border-ink-600" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label={`Account menu for ${user.name}`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-700 transition"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white">
              {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div className="hidden sm:block leading-tight text-left">
              <div className="text-sm text-white">{user.name}</div>
              <div className="text-[10px] text-muted">{user.title}</div>
            </div>
            <ChevronDown size={14} className={`text-muted hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>
          {profileOpen && (
            <div role="menu" aria-label="Account menu" className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-ink-600 bg-ink-900 p-2 shadow-xl">
              <div className="px-3 py-2 border-b border-ink-700">
                <div className="text-sm text-white">{user.name}</div>
                <div className="text-xs text-muted truncate">{user.email}</div>
                <div className="text-[10px] text-brand-400 mt-1">{roleLabel[user.role]}</div>
              </div>
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
