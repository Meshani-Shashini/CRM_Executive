import { useState } from 'react';
import { LEADS, FUNNELS, PRODUCT_CODES } from '../data/seed';
import Badge from '../components/ui/Badge';
import { Flame, Sun, Snowflake, List, Columns3, Filter, Plus, Phone, Calendar, FileText } from 'lucide-react';
import type { Lead, LeadTemperature } from '../types';

const tempVariant: Record<LeadTemperature, 'hot' | 'warm' | 'cold'> = {
  HOT: 'hot', WARM: 'warm', COLD: 'cold',
};
const tempIcon = { HOT: Flame, WARM: Sun, COLD: Snowflake };

export default function LeadsPage() {
  const [funnelId, setFunnelId] = useState(FUNNELS[0].id);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const funnel = FUNNELS.find((f) => f.id === funnelId)!;
  const [leads] = useState<Lead[]>(LEADS);

  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
            {FUNNELS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFunnelId(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  funnelId === f.id ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !py-1.5"><Filter size={14} /> Filter</button>
          <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
            <button onClick={() => setView('kanban')} className={`p-1.5 rounded-md ${view === 'kanban' ? 'bg-ink-700 text-white' : 'text-muted'}`}><Columns3 size={15} /></button>
            <button onClick={() => setView('table')} className={`p-1.5 rounded-md ${view === 'table' ? 'bg-ink-700 text-white' : 'text-muted'}`}><List size={15} /></button>
          </div>
          <button className="btn-primary !py-1.5"><Plus size={14} /> New Lead</button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {funnel.stages.map((stage) => {
            const stageLeads = leads.filter((l) => l.funnelStage === stage);
            return (
              <div key={stage} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="text-sm font-semibold text-white">{stage}</div>
                  <span className="pill bg-ink-700 text-muted border border-ink-600">{stageLeads.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px] bg-ink-900/40 rounded-xl p-2">
                  {stageLeads.map((l) => {
                    const TIcon = tempIcon[l.temperature];
                    return (
                      <div key={l.id} className="glass-soft rounded-xl p-3 hover:border-ink-500 transition cursor-pointer group">
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-sm font-semibold text-white truncate">{l.client}</div>
                          <Badge variant={tempVariant[l.temperature]} dot>
                            <TIcon size={10} /> {l.temperature}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted mb-2">{l.contact} · {l.country}</div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          <span className="pill bg-brand-400/10 text-brand-400 border border-brand-400/30 !px-1.5">
                            {l.productCode} · {productName(l.productCode)}
                          </span>
                          <Badge variant={l.status === 'IN-PROGRESS' ? 'warm' : l.status === 'TO-DO' ? 'cold' : 'muted'}>
                            {l.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-ink-700/60">
                          <span>MVR {(l.premium / 1000).toFixed(0)}k</span>
                          <span>Renew {new Date(l.renewalDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                        </div>
                      </div>
                    );
                  })}
                  {stageLeads.length === 0 && (
                    <div className="text-center text-[11px] text-muted/60 py-8">Drop leads here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-left px-4 py-3 font-medium">Temp</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Stage</th>
                <th className="text-right px-4 py-3 font-medium">Premium</th>
                <th className="text-left px-4 py-3 font-medium">Renewal</th>
                <th className="text-left px-4 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const TIcon = tempIcon[l.temperature];
                return (
                  <tr key={l.id} className="table-row hover:bg-ink-750/40">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{l.client}</div>
                      <div className="text-[11px] text-muted">{l.contact}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="pill bg-brand-400/10 text-brand-400 border border-brand-400/30 !px-1.5">
                        {l.productCode}
                      </span>
                      <div className="text-[11px] text-muted mt-1">{productName(l.productCode)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tempVariant[l.temperature]} dot>
                        <TIcon size={10} /> {l.temperature}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={l.status === 'IN-PROGRESS' ? 'warm' : l.status === 'TO-DO' ? 'cold' : 'muted'}>
                        {l.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{l.funnelStage}</td>
                    <td className="px-4 py-3 text-right text-white font-medium">MVR {l.premium.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted">{new Date(l.renewalDate).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3 text-muted text-xs">{l.lastActivity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
