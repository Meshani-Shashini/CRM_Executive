import { useState } from 'react';
import { CLIENTS, ACTIVITIES, PRODUCT_CODES, USERS } from '../data/seed';
import Badge from '../components/ui/Badge';
import {
  Phone, Mail, MapPin, Calendar, FileText, MessageSquare, Upload,
  Building2, Briefcase, ShieldCheck, Plus, Search,
} from 'lucide-react';
import type { Activity } from '../types';

const activityIcon = {
  call: Phone, meeting: Calendar, email: Mail, upload: Upload, note: MessageSquare, quote: FileText,
};

export default function ClientsPage() {
  const [selectedId, setSelectedId] = useState(CLIENTS[0].id);
  const [query, setQuery] = useState('');
  const selected = CLIENTS.find((c) => c.id === selectedId)!;
  const activities = ACTIVITIES.filter((a) => a.clientId === selectedId);
  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;
  const owner = USERS.find((u) => u.id === selected.ownerId);

  const filtered = CLIENTS.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.tin.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-8rem)]">
      {/* List */}
      <div className="glass rounded-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-ink-600">
          <div className="flex items-center gap-2 bg-ink-900/80 border border-ink-600 rounded-lg px-3 py-2">
            <Search size={14} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="bg-transparent text-sm text-white outline-none flex-1 placeholder:text-muted/70"
            />
          </div>
          <button className="btn-primary w-full mt-2 !py-2"><Plus size={14} /> Add Client</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-3 border-b border-ink-700/50 transition ${
                selectedId === c.id ? 'bg-brand-500/10 border-l-2 border-l-brand-400' : 'hover:bg-ink-750/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-ink-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted">TIN: {c.tin}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="pill bg-brand-400/10 text-brand-400 border border-brand-400/30 !px-1.5">
                  {c.productCode}
                </span>
                {c.tags.slice(0, 1).map((t) => (
                  <Badge key={t} variant="muted">{t}</Badge>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex flex-col gap-4 overflow-y-auto">
        {/* Header */}
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg">
                {selected.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                <div className="text-sm text-muted mt-0.5">TIN: {selected.tin} · {selected.country}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge variant="brand" dot>{selected.class}</Badge>
                  <Badge variant="muted">{productName(selected.productCode)}</Badge>
                  {selected.tags.map((t) => <Badge key={t} variant="win">{t}</Badge>)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost !py-2"><FileText size={14} /> New Quote</button>
              <button className="btn-primary !py-2"><Plus size={14} /> Log Activity</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Client info */}
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Building2 size={16} /> Client Information</h3>
              <div className="space-y-3 text-sm">
                <InfoRow icon={Phone} label="Phone" value={selected.phone} />
                <InfoRow icon={Mail} label="Email" value={selected.email} />
                <InfoRow icon={MapPin} label="Address" value={selected.address} />
                <InfoRow icon={Briefcase} label="Account Owner" value={owner?.name ?? '—'} />
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><ShieldCheck size={16} /> Policy Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Sum Insured" value={`MVR ${selected.sumInsured.toLocaleString()}`} />
                <Metric label="Premium" value={`MVR ${selected.premium.toLocaleString()}`} />
                <Metric label="Expiry" value={new Date(selected.expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} />
                <Metric label="Insurer" value={selected.insurer} />
                <Metric label="Class" value={selected.class} />
                <Metric label="Product" value={`${selected.productCode} · ${productName(selected.productCode)}`} />
              </div>
            </div>
          </div>

          {/* Right: Activity timeline */}
          <div className="glass rounded-2xl p-5 flex flex-col">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Calendar size={16} /> Activity Timeline</h3>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {activities.map((a: Activity, i) => {
                const Icon = activityIcon[a.type];
                return (
                  <div key={a.id} className="relative pl-8">
                    {i < activities.length - 1 && (
                      <div className="absolute left-3 top-7 bottom-[-12px] w-px bg-ink-600" />
                    )}
                    <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center">
                      <Icon size={12} className="text-brand-400" />
                    </div>
                    <div className="bg-ink-900/40 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-white">{a.title}</div>
                        <div className="text-[10px] text-muted">{a.date}</div>
                      </div>
                      <div className="text-xs text-muted mt-1">{a.description}</div>
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && (
                <div className="text-center text-muted text-sm py-8">No activity yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted">{label}</div>
        <div className="text-white text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-900/50 rounded-lg p-3">
      <div className="text-[11px] text-muted mb-1">{label}</div>
      <div className="text-white text-sm font-medium">{value}</div>
    </div>
  );
}
