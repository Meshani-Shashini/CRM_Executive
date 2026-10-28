import { useState } from 'react';
import { useApp } from '../store/AppContext';
import {
  LayoutDashboard, CalendarDays, Users, FileText, Receipt, Wallet,
  ShieldCheck, Settings, BarChart3, FolderKanban, Target,
  FileSliders, Percent, BookUser, Briefcase, Files,
  CreditCard, Send, RefreshCcw, Info, ChevronRight, LogOut,
} from 'lucide-react';
import type { Role } from '../types';

export type NavKey =
  | 'dashboard' | 'plans' | 'leads' | 'deals' | 'clients' | 'calendar' | 'reports' | 'documents'
  | 'quotations' | 'qslips' | 'internal-slips' | 'invoices' | 'payments' | 'pay-requests'
  | 'renewals' | 'info-requests' | 'rate-cards'
  | 'settings' | 'funnels' | 'pipelines' | 'targets' | 'audit-log'
  | 'mira';

interface NavItemDef {
  key: NavKey;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItemDef[];
}

const GROUPS: NavGroup[] = [
  {
    label: 'Broker Portal', icon: Briefcase,
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'sales', 'finance'] },
      { key: 'plans', label: 'My Plan', icon: Target, roles: ['admin', 'sales'] },
      { key: 'leads', label: 'Leads', icon: FolderKanban, roles: ['admin', 'sales'] },
      { key: 'deals', label: 'Deals', icon: Wallet, roles: ['admin', 'sales'] },
      { key: 'clients', label: 'Clients', icon: Users, roles: ['admin', 'sales', 'finance', 'client'] },
      { key: 'calendar', label: 'Calendar', icon: CalendarDays, roles: ['admin', 'sales'] },
      { key: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'finance'] },
      { key: 'documents', label: 'Documents', icon: Files, roles: ['admin', 'sales', 'finance', 'client'] },
    ],
  },
  {
    label: 'Policy Portal', icon: ShieldCheck,
    items: [
      { key: 'qslips', label: 'Quotation Slips', icon: FileSliders, roles: ['admin', 'sales'] },
      { key: 'quotations', label: 'Quotations', icon: FileText, roles: ['admin', 'sales'] },
      { key: 'internal-slips', label: 'Internal Slips', icon: BookUser, roles: ['admin', 'sales'] },
      { key: 'invoices', label: 'Invoice', icon: Receipt, roles: ['admin', 'finance', 'client'] },
      { key: 'payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'finance', 'client'] },
      { key: 'pay-requests', label: 'Payment Requests', icon: Send, roles: ['admin', 'finance'] },
      { key: 'renewals', label: 'Renewals', icon: RefreshCcw, roles: ['admin', 'sales'] },
      { key: 'info-requests', label: 'Info Requests', icon: Info, roles: ['admin', 'sales'] },
      { key: 'rate-cards', label: 'Rate Cards', icon: Percent, roles: ['admin', 'sales'] },
    ],
  },
  {
    label: 'Admin Portal', icon: Settings,
    items: [
      { key: 'settings', label: 'Settings', icon: Settings, roles: ['admin'] },
      { key: 'funnels', label: 'Funnels', icon: BarChart3, roles: ['admin', 'sales', 'finance'] },
      { key: 'pipelines', label: 'Pipelines', icon: FileSliders, roles: ['admin', 'sales'] },
    ],
  },
];

const roleLabel: Record<Role, string> = {
  admin: 'System Admin',
  sales: 'Sales',
  finance: 'Accountant',
  client: 'Client',
};

export default function Sidebar({
  active, open, onClose,
}: {
  active: NavKey;
  open: boolean;
  onClose: () => void;
}) {
  const { user, viewAsRole, setViewAsRole, signOut, company } = useApp();
  const activeRole = viewAsRole ?? user.role;
  const [signOutError, setSignOutError] = useState('');

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[180px] bg-[#0B0C0E] border-r border-[#1B1E22] flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="border-b border-ink-700 px-3 py-4">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E2024] text-[10px] font-semibold text-[#8E95A2]">
              {avatarCode(user.name)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-white">{user.name}</div>
              <div className="truncate text-[10px] text-muted">{user.email || company.legalName}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-7">
          {GROUPS.map((g) => {
            const visibleItems = g.items.filter((i) => i.roles.includes(activeRole));
            if (visibleItems.length === 0) return null;
            return (
              <div key={g.label}>
                <div className="flex items-center gap-2 px-3 mb-1.5 text-[10px] uppercase tracking-wider text-muted/70 font-semibold">
                  <g.icon size={12} />
                  {g.label}
                  {g.label === 'Admin Portal' && (
                    <span className="ml-auto pill bg-hot/10 text-hot border border-hot/30 !px-1.5 !py-0.5 !text-[9px]">
                      <ShieldCheck size={9} /> Restricted
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.key;
                    return (
                      <a
                        key={item.key}
                        href={`#/${item.key}`}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                        className={`nav-item w-full !px-2 !text-xs !font-medium no-underline ${isActive ? 'nav-item-active' : ''}`}
                      >
                        <Icon size={16} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isActive && <ChevronRight size={14} className="text-brand-400" />}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-ink-600">
          {viewAsRole && <div className="mb-2 px-2 text-[10px] text-warm">Viewing as {roleLabel[viewAsRole]}</div>}
          {user.role === 'admin' && (
            <div className="mt-2 grid grid-cols-2 gap-1" role="group" aria-label="Preview role">
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
                    onClose();
                  }}
                  className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition ${
                    activeRole === role ? 'bg-brand-500 text-white' : 'text-muted hover:bg-ink-700 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {signOutError && <p role="alert" className="mt-2 px-2 text-xs text-hot">{signOutError}</p>}
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut();
              } catch (error) {
                setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
              }
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted hover:bg-ink-700 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function avatarCode(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).slice(0, 2).join('') : (parts[0] ?? '').slice(0, 2)).toUpperCase();
}
