import { useApp } from '../store/AppContext';
import {
  LayoutDashboard, CalendarDays, Users, FileText, Receipt, Wallet,
  ShieldCheck, Settings, BarChart3, FolderKanban, Target, ScrollText,
  FileCheck2, FileSliders, Percent, Bell, BookUser, Briefcase, Files,
  CreditCard, Send, RefreshCcw, Info, StickyNote, LogOut, ChevronRight,
} from 'lucide-react';
import type { Role } from '../types';
import { USERS, COMPANY } from '../data/seed';

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
      { key: 'plans', label: 'My Plans', icon: Target, roles: ['admin', 'sales'] },
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
      { key: 'invoices', label: 'Invoices', icon: Receipt, roles: ['admin', 'finance', 'client'] },
      { key: 'payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'finance', 'client'] },
      { key: 'pay-requests', label: 'Payment Requests', icon: Send, roles: ['admin', 'finance'] },
      { key: 'renewals', label: 'Renewals', icon: RefreshCcw, roles: ['admin', 'sales'] },
      { key: 'info-requests', label: 'Info Requests', icon: Info, roles: ['admin', 'sales'] },
      { key: 'rate-cards', label: '% Rate Cards', icon: Percent, roles: ['admin', 'sales'] },
    ],
  },
  {
    label: 'Admin Portal', icon: Settings,
    items: [
      { key: 'settings', label: 'Settings', icon: Settings, roles: ['admin'] },
      { key: 'funnels', label: 'Funnels', icon: FolderKanban, roles: ['admin'] },
      { key: 'pipelines', label: 'Pipelines', icon: FileSliders, roles: ['admin'] },
      { key: 'targets', label: 'Targets', icon: Target, roles: ['admin'] },
      { key: 'audit-log', label: 'Audit Log', icon: ScrollText, roles: ['admin'] },
    ],
  },
  {
    label: 'Regulatory', icon: FileCheck2,
    items: [
      { key: 'mira', label: 'MIRA Form 1', icon: FileCheck2, roles: ['admin', 'finance'] },
    ],
  },
];

const roleLabel: Record<Role, string> = {
  admin: 'System Admin',
  sales: 'Sales Agent',
  finance: 'Accountant',
  client: 'Client',
};

export default function Sidebar({
  active, onNavigate, open, onClose,
}: {
  active: NavKey;
  onNavigate: (k: NavKey) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { user, setUser } = useApp();

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[260px] bg-ink-900 border-r border-ink-600 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="px-4 py-4 border-b border-ink-600">
          <div className="flex items-center gap-2.5">
            <img
              src="/WhatsApp_Image_2026-10-18_at_9.51.24_AM.jpeg"
              alt="IBMS"
              className="w-10 h-10 rounded-xl object-cover ring-1 ring-ink-600 shadow-glow"
            />
            <div className="leading-tight">
              <div className="text-white font-bold tracking-wide">IBMS</div>
              <div className="text-[10px] text-muted uppercase tracking-wider">Brokers Management</div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-muted/80 truncate">{COMPANY.legalName}</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-4">
          {GROUPS.map((g) => {
            const visibleItems = g.items.filter((i) => i.roles.includes(user.role));
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
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => { onNavigate(item.key); onClose(); }}
                        className={`nav-item w-full ${isActive ? 'nav-item-active' : ''}`}
                      >
                        <Icon size={16} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isActive && <ChevronRight size={14} className="text-brand-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Profile */}
        <div className="p-3 border-t border-ink-600">
          <div className="text-[10px] uppercase tracking-wider text-muted/70 mb-2 px-1">Signed in as</div>
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-ink-800/60">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-bold text-white">
              {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div className="flex-1 leading-tight min-w-0">
              <div className="text-sm text-white truncate">{user.name}</div>
              <div className="text-[10px] text-muted truncate">{user.email}</div>
            </div>
            <span className="pill bg-brand-400/10 text-brand-400 border border-brand-400/30 !px-1.5 !py-0.5 !text-[9px]">
              {roleLabel[user.role]}
            </span>
          </div>
          <div className="mt-2 px-2">
            <div className="text-[10px] text-muted/70 mb-1">Switch role (demo)</div>
            <div className="grid grid-cols-4 gap-1">
              {USERS.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setUser(u)}
                  className={`text-[10px] py-1 rounded-md border transition ${
                    user.id === u.id
                      ? 'bg-brand-500/20 border-brand-400/40 text-white'
                      : 'bg-ink-800/50 border-ink-600 text-muted hover:text-white hover:border-ink-500'
                  }`}
                  title={roleLabel[u.role]}
                >
                  {roleLabel[u.role].split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
