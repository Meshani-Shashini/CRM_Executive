import { useState } from 'react';
import { MIRA_ROWS, COMPANY } from '../data/seed';
import { Download, FileCheck2, Calendar, Filter } from 'lucide-react';

export default function MiraPage() {
  const [from, setFrom] = useState('2025-10-01');
  const [to, setTo] = useState('2025-12-31');

  const totals = MIRA_ROWS.reduce(
    (acc, r) => {
      acc.sumInsured += r.sumInsured;
      acc.premium += r.premium;
      acc.commission += r.commissionAmount;
      acc.brokerage += r.brokerageFee;
      return acc;
    },
    { sumInsured: 0, premium: 0, commission: 0, brokerage: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-win/10 border border-win/30 flex items-center justify-center">
              <FileCheck2 size={20} className="text-win" />
            </div>
            <div>
              <h2 className="text-white font-semibold">MIRA Form 1 — Summary of Business Written</h2>
              <p className="text-sm text-muted mt-0.5">Maldives Inland Revenue Authority · statutory regulatory export</p>
            </div>
          </div>
          <button className="btn-primary"><Download size={14} /> Export PDF / CSV</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div>
            <label className="text-xs text-muted flex items-center gap-1.5 mb-1.5"><Calendar size={12} /> Period From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs text-muted flex items-center gap-1.5 mb-1.5"><Calendar size={12} /> Period To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn-ghost w-full"><Filter size={14} /> Apply Filter</button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-600 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">{COMPANY.legalName}</div>
            <div className="text-xs text-muted">Reg: {COMPANY.registration} · Period {from} to {to}</div>
          </div>
          <div className="text-xs text-muted">{MIRA_ROWS.length} records</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-medium w-10">#</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Insured Risk</th>
                <th className="text-left px-4 py-3 font-medium">Insurer</th>
                <th className="text-right px-4 py-3 font-medium">Sum Insured</th>
                <th className="text-right px-4 py-3 font-medium">Premium</th>
                <th className="text-right px-4 py-3 font-medium">Comm. %</th>
                <th className="text-right px-4 py-3 font-medium">Commission</th>
                <th className="text-right px-4 py-3 font-medium">Brokerage Fee</th>
              </tr>
            </thead>
            <tbody>
              {MIRA_ROWS.map((r, i) => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-muted text-xs">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 text-white">{r.insured}</td>
                  <td className="px-4 py-3 text-muted">{r.insurer}</td>
                  <td className="px-4 py-3 text-right text-white">{r.sumInsured.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-white">{r.premium.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-muted">{r.commissionPct}%</td>
                  <td className="px-4 py-3 text-right text-win">{r.commissionAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-muted">{r.brokerageFee.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-800/80 text-white font-semibold">
              <tr className="border-t-2 border-ink-600">
                <td colSpan={4} className="px-4 py-3 text-right text-muted uppercase text-xs">Totals</td>
                <td className="px-4 py-3 text-right">{totals.sumInsured.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{totals.premium.toLocaleString()}</td>
                <td></td>
                <td className="px-4 py-3 text-right text-win">{totals.commission.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{totals.brokerage.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
