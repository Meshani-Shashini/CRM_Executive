import { useState } from 'react';
import { PAYMENTS } from '../data/seed';
import Badge from '../components/ui/Badge';
import { Plus, CreditCard, Download, TrendingUp } from 'lucide-react';

export default function PaymentsPage() {
  const [tab, setTab] = useState<'all' | 'Premium' | 'Commission' | 'Fee'>('all');
  const filtered = tab === 'all' ? PAYMENTS : PAYMENTS.filter((p) => p.type === tab);
  const total = PAYMENTS.reduce((s, p) => s + p.amount, 0);
  const commissionTotal = PAYMENTS.filter((p) => p.type === 'Commission').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted uppercase tracking-wider">Total Received</div>
            <CreditCard size={16} className="text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">MVR {total.toLocaleString()}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted uppercase tracking-wider">Commission Income</div>
            <TrendingUp size={16} className="text-win" />
          </div>
          <div className="text-2xl font-bold text-win mt-1">MVR {commissionTotal.toLocaleString()}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase tracking-wider">Pending Receipts</div>
          <div className="text-2xl font-bold text-warm mt-1">2</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
          {(['all', 'Premium', 'Commission', 'Fee'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
              }`}
            >
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
        <button className="btn-primary !py-1.5"><Plus size={14} /> Record Payment</button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Receipt #</th>
              <th className="text-left px-4 py-3 font-medium">Invoice</th>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Method</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-4 py-3 font-mono text-brand-400">{p.receiptNo}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">{p.invoiceNumber}</td>
                <td className="px-4 py-3 text-white">{p.clientName}</td>
                <td className="px-4 py-3"><Badge variant={p.type === 'Commission' ? 'win' : 'brand'}>{p.type}</Badge></td>
                <td className="px-4 py-3 text-muted">{p.method}</td>
                <td className="px-4 py-3 text-muted text-xs">{new Date(p.date).toLocaleDateString('en-GB')}</td>
                <td className="px-4 py-3 text-right text-white font-medium">MVR {p.amount.toLocaleString()}</td>
                <td className="px-4 py-3"><Badge variant={p.status === 'Completed' ? 'win' : 'warm'} dot>{p.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white"><Download size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
