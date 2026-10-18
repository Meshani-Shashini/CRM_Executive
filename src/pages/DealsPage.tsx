import { useState } from 'react';
import { DEALS } from '../data/seed';
import Badge from '../components/ui/Badge';
import { Plus, Filter, TrendingUp } from 'lucide-react';

const stageColors: Record<string, 'cold' | 'warm' | 'win' | 'hot'> = {
  'Lead Identified': 'cold',
  'Contact Made': 'cold',
  'Key Person Identified': 'warm',
  Quoted: 'warm',
  'Internal Slip': 'hot',
};

export default function DealsPage() {
  const [deals] = useState(DEALS);
  const totalValue = deals.reduce((s, d) => s + d.value, 0);
  const totalWeighted = deals.reduce((s, d) => s + d.weighted, 0);

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
          <button className="btn-ghost !py-1.5"><Filter size={14} /> Filter</button>
          <button className="btn-primary !py-1.5"><Plus size={14} /> New Deal</button>
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
            {deals.map((d) => (
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
    </div>
  );
}
