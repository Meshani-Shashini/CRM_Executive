import { useState, type FormEvent } from 'react';
import { FUNNELS, PRODUCT_CODES } from '../data/seed';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Flame, Sun, Snowflake, List, Columns3, Filter, Plus, X } from 'lucide-react';
import type { Lead, LeadTemperature } from '../types';

const tempVariant: Record<LeadTemperature, 'hot' | 'warm' | 'cold'> = {
  HOT: 'hot', WARM: 'warm', COLD: 'cold',
};
const tempIcon = { HOT: Flame, WARM: Sun, COLD: Snowflake };

export default function LeadsPage() {
  const { leads, setLeads, user } = useApp();
  const [funnelId, setFunnelId] = useState(FUNNELS[0].id);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const funnel = FUNNELS.find((f) => f.id === funnelId)!;
  const visibleLeads = leads.filter((lead) =>
    (!temperatureFilter || lead.temperature === temperatureFilter) &&
    (!stageFilter || lead.funnelStage === stageFilter)
  );

  const productName = (code: string) => PRODUCT_CODES.find((p) => p.code === code)?.name ?? code;

  const createLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const productCode = String(data.get('productCode'));
    const product = PRODUCT_CODES.find((item) => item.code === productCode);
    const lead: Lead = {
      id: `L-${Date.now()}`,
      client: String(data.get('client')).trim(),
      contact: String(data.get('contact')).trim(),
      country: String(data.get('country')).trim(),
      insuranceClass: product?.category ?? 'Miscellaneous',
      productCode,
      temperature: data.get('temperature') as LeadTemperature,
      status: 'TO-DO',
      funnelStage: funnel.stages[0],
      renewalDate: String(data.get('renewalDate')),
      sumInsured: Number(data.get('sumInsured')),
      premium: Number(data.get('premium')),
      ownerId: user.id,
      lastActivity: 'Just now',
    };
    setLeads([lead, ...leads]);
    setNewLeadOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
            {FUNNELS.map((f) => (
              <button
                key={f.id}
                onClick={() => { setFunnelId(f.id); setStageFilter(''); }}
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
          <button className="btn-ghost !py-1.5" onClick={() => setFilterOpen(true)}><Filter size={14} /> Filter</button>
          <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
            <button onClick={() => setView('kanban')} className={`p-1.5 rounded-md ${view === 'kanban' ? 'bg-ink-700 text-white' : 'text-muted'}`}><Columns3 size={15} /></button>
            <button onClick={() => setView('table')} className={`p-1.5 rounded-md ${view === 'table' ? 'bg-ink-700 text-white' : 'text-muted'}`}><List size={15} /></button>
          </div>
          <button className="btn-primary !py-1.5" onClick={() => setNewLeadOpen(true)}><Plus size={14} /> New Lead</button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {funnel.stages.map((stage) => {
            const stageLeads = visibleLeads.filter((l) => l.funnelStage === stage);
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
              {visibleLeads.map((l) => {
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

      <Modal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        title="Create Lead"
        subtitle="Add a prospect to the active sales funnel."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setNewLeadOpen(false)}><X size={14} /> Cancel</button>
            <button type="submit" form="new-lead-form" className="btn-primary"><Plus size={14} /> Create Lead</button>
          </>
        }
      >
        <form id="new-lead-form" onSubmit={createLead} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client / Company"><input className="input" name="client" required /></Field>
          <Field label="Contact"><input className="input" name="contact" required /></Field>
          <Field label="Country"><input className="input" name="country" defaultValue="Maldives" required /></Field>
          <Field label="Product"><select className="input" name="productCode">{PRODUCT_CODES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select></Field>
          <Field label="Temperature"><select className="input" name="temperature"><option>WARM</option><option>HOT</option><option>COLD</option></select></Field>
          <Field label="Renewal Date"><input className="input" name="renewalDate" type="date" required /></Field>
          <Field label="Sum Insured (MVR)"><input className="input" name="sumInsured" type="number" min="0" required /></Field>
          <Field label="Premium (MVR)"><input className="input" name="premium" type="number" min="0" required /></Field>
        </form>
      </Modal>
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter Leads"
        footer={
          <>
            <button className="btn-ghost" onClick={() => { setTemperatureFilter(''); setStageFilter(''); }}>Clear</button>
            <button className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button>
          </>
        }
        size="sm"
      >
        <div className="space-y-3">
          <Field label="Funnel stage"><select className="input" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option value="">All stages</option>{funnel.stages.map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
          <Field label="Temperature"><select className="input" value={temperatureFilter} onChange={(e) => setTemperatureFilter(e.target.value)}><option value="">All temperatures</option><option>HOT</option><option>WARM</option><option>COLD</option></select></Field>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
