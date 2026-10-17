import { navItems, type PageId } from '@/components/nav';
import { ShieldCheck, Search, Bell, ChevronDown, Zap } from 'lucide-react';

interface SidebarProps {
  active: PageId;
  onSelect: (id: PageId) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="glass-nav w-64 shrink-0 flex flex-col h-screen sticky top-0">
      <div className="px-5 pt-6 pb-5 border-b border-base-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-indigo to-accent-emerald flex items-center justify-center shadow-glow">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-100">Aether CRM</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Executive HUD</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 scrollbar-thin overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-slate-600 font-medium">
          Workspace
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? 'bg-accent-indigo/15 text-slate-100 shadow-glow border border-accent-indigo/30'
                  : 'text-slate-400 hover:bg-base-raised/40 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                  isActive ? 'text-accent-indigo' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              <div className="leading-tight flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500 truncate">{item.hint}</p>
              </div>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-indigo animate-pulse-soft" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-base-border/40">
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-accent-amber" />
            <p className="text-[11px] font-semibold text-slate-200">AI Copilot</p>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Monitoring 4 regions · 5 active risk signals
          </p>
        </div>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 glass-nav border-b border-base-border/40 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search deals, customers, invoices…"
            className="glass-input pl-9 pr-4 py-2 text-sm w-72 placeholder:text-slate-600"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base-raised/40 border border-base-border/40">
          <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse-soft" />
          <span className="text-[11px] text-slate-400">Live · 4 regions synced</span>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-base-raised/50 transition-colors">
          <Bell className="w-4 h-4 text-slate-400" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-crimson" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-base-border/40">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-indigo to-accent-emerald flex items-center justify-center text-[11px] font-semibold text-white">
            MF
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-xs font-medium text-slate-200">Marcus Farooq</p>
            <p className="text-[10px] text-slate-500">VP Global Sales</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </div>
      </div>
    </header>
  );
}
