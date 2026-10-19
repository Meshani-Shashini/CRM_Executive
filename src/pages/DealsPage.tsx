import { useState, type FormEvent } from 'react';
import { INSURERS, PRODUCT_CODES, FUNNELS } from '../data/seed';
import { DEFAULT_PIPELINES } from '../data/pipelineDefaults';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Plus, Filter, X } from 'lucide-react';
import type { Deal } from '../types';

const stageColors: Record<string, 'cold' | 'warm' | 'win' | 'hot'> = {
  'Lead Identified': 'cold',
  'Contact Made': 'cold',
  'Key Person Identified': 'warm',
  Quoted: 'warm',
  'Internal Slip': 'hot',
};

export default function DealsPage() {
  const { deals, setDeals, clients, user } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('');
  const visibleDeals = stageFilter ? deals.filter((deal) => deal.stage === stageFilter) : deals;
  const totalValue = deals.reduce((s, d) => s + d.value, 0);
  const totalWeighted = deals.reduce((s, d) => s + d.weighted, 0);

  const createDeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Number(data.get('value'));
    const probability = Number(data.get('probability'));
    const deal: Deal = {
      id: `d-${Date.now()}`,
      pipelineId: DEFAULT_PIPELINES[0].id,
      client: String(data.get('client')),
      product: String(data.get('product')),
      value,
      weighted: Math.round(value * probability / 100),
      stage: String(data.get('stage')),
      probability,
      ownerId: user.id,
      closeDate: String(data.get('closeDate')),
      insurer: String(data.get('insurer')),
    };
    setDeals([deal, ...deals]);
    setCreateOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Total Pipeline</div>
          <div className="text-2xl font-bold text-white mt-1">MVR {totalValue.toLocaleString()}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Weighted</div>
          <div className="text-2xl font-bold text-brand-400 mt-1">MVR {totalWeighted.toLocaleString()}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Open Deals</div>
          <div className="text-2xl font-bold text-white mt-1">{deals.length}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Sales Pipeline</h2>
        <div className="flex gap-2">
            <button className="btn-ghost !py-1.5" onClick={() => setFilterOpen(true)}><Filter size={14} /> Filter</button>
            <button className="btn-primary !py-1.5" onClick={() => setCreateOpen(true)}><Plus size={14} /> New Deal</button>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Product</th>
              <th className="text-left px-4 py-3 font-medium">Insurer</th>
              <th className="text-left px-4 py-3 font-medium">Stage</th>
              <th className="text-right px-4 py-3 font-medium">Value</th>
              <th className="text-right px-4 py-3 font-medium">Weighted</th>
              <th className="text-left px-4 py-3 font-medium">Prob.</th>
              <th className="text-left px-4 py-3 font-medium">Close Date</th>
            </tr>
          </thead>
          <tbody>
            {visibleDeals.map((d) => (
              <tr key={d.id} className="table-row">
                <td className="px-4 py-3 text-white font-medium">{d.client}</td>
                <td className="px-4 py-3 text-muted">{d.product}</td>
                <td className="px-4 py-3 text-muted">{d.insurer}</td>
                <td className="px-4 py-3">
                  <Badge variant={stageColors[d.stage] ?? 'muted'} dot>{d.stage}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-white">MVR {d.value.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-brand-400 font-medium">MVR {d.weighted.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-ink-900 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${d.probability}%` }} />
                    </div>
                    <span className="text-xs text-muted">{d.probability}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted text-xs">{new Date(d.closeDate).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Deal"
        subtitle="Add a sales opportunity to the pipeline."
        footer={<><button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}><X size={14} /> Cancel</button><button type="submit" form="new-deal-form" className="btn-primary"><Plus size={14} /> Create Deal</button></>}
      >
        <form id="new-deal-form" onSubmit={createDeal} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client"><select className="input" name="client" required>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Product"><select className="input" name="product">{PRODUCT_CODES.map((product) => <option key={product.code}>{product.name}</option>)}</select></Field>
          <Field label="Insurer"><select className="input" name="insurer">{INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></Field>
          <Field label="Stage"><select className="input" name="stage">{FUNNELS[0].stages.map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
          <Field label="Deal Value (MVR)"><input className="input" name="value" type="number" min="0" required /></Field>
          <Field label="Probability (%)"><input className="input" name="probability" type="number" min="0" max="100" defaultValue="50" required /></Field>
          <Field label="Expected Close"><input className="input" name="closeDate" type="date" required /></Field>
        </form>
      </Modal>
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter Deals" size="sm" footer={<><button className="btn-ghost" onClick={() => setStageFilter('')}>Clear</button><button className="btn-primary" onClick={() => setFilterOpen(false)}>Apply Filter</button></>}>
        <Field label="Stage"><select className="input" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option value="">All stages</option>{[...new Set(deals.map((deal) => deal.stage))].map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
