import { useState } from 'react';
import { Download, FileCheck2, Calendar, Filter, Printer } from 'lucide-react';
import { downloadCsv } from '../utils/downloadCsv';
import { useApp } from '../store/AppContext';
import type { MiraRow } from '../types';
import { formatDate } from '../utils/date';
import DateInput from '../components/ui/DateInput';

export default function MiraPage() {
  const { company } = useApp();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [appliedRange, setAppliedRange] = useState({ from: `${year}-01-01`, to: new Date().toISOString().slice(0, 10) });
  const rows: MiraRow[] = [];

  const totals = rows.reduce(
    (acc, r) => {
      acc.sumInsured += r.sumInsured;
      acc.premium += r.premium;
      acc.commission += r.commissionAmount;
      acc.brokerage += r.brokerageFee;
      return acc;
    },
    { sumInsured: 0, premium: 0, commission: 0, brokerage: 0 }
  );

  const printReport = () => {
    document.body.classList.add('print-mira');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-mira'), { once: true });
    window.print();
  };

  return (
    <div className="space-y-5 print-report">
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
          <div className="flex gap-2">
            <button className="btn-ghost print:hidden" onClick={printReport}><Printer size={14} /> Print / Save PDF</button>
            <button className="btn-primary print:hidden" onClick={() => downloadCsv('mira-form-1.csv', ['Date', 'Insured Risk', 'Insurer', 'Sum Insured', 'Premium', 'Commission %', 'Commission', 'Brokerage Fee'], rows.map((row) => [row.date, row.insured, row.insurer, row.sumInsured, row.premium, row.commissionPct, row.commissionAmount, row.brokerageFee]))}><Download size={14} /> Export CSV</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div>
            <label htmlFor="mira-from" className="text-xs text-muted flex items-center gap-1.5 mb-1.5"><Calendar size={12} /> Period From</label>
            <DateInput id="mira-from" value={from} onIsoChange={setFrom} aria-label="MIRA report from date" />
          </div>
          <div>
            <label htmlFor="mira-to" className="text-xs text-muted flex items-center gap-1.5 mb-1.5"><Calendar size={12} /> Period To</label>
            <DateInput id="mira-to" value={to} onIsoChange={setTo} aria-label="MIRA report to date" />
          </div>
          <div className="flex items-end">
            <button className="btn-ghost w-full print:hidden" onClick={() => setAppliedRange({ from, to })}><Filter size={14} /> Apply Filter</button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-600 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">{company.legalName}</div>
            <div className="text-xs text-muted">Reg: {company.registration} · Period {appliedRange.from} to {appliedRange.to}</div>
          </div>
          <div className="text-xs text-muted">{rows.length} records</div>
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
              {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No MIRA records in this period.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(r.date)}</td>
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
