import { useState } from 'react';
import { INVOICES, COMPANY, BANK_DETAILS } from '../data/seed';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { Receipt, Download, Eye, Plus, Printer } from 'lucide-react';
import type { Invoice } from '../types';

const statusVariant: Record<string, 'win' | 'warm' | 'hot' | 'cold' | 'muted'> = {
  Paid: 'win', Partial: 'warm', Pending: 'cold', Overdue: 'hot', Archived: 'muted',
};

export default function InvoicesPage() {
  const { taxRates } = useApp();
  const [tab, setTab] = useState<'all' | 'Pending' | 'Paid' | 'Overdue' | 'Archived'>('all');
  const [selected, setSelected] = useState<Invoice | null>(null);

  const filtered = tab === 'all' ? INVOICES : INVOICES.filter((i) => i.status === tab);

  const computeTotals = (inv: Invoice) => {
    const subtotal = inv.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const vat = inv.items.reduce((s, it) => s + it.unitPrice * it.qty * (it.vatRate / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
          {(['all', 'Pending', 'Paid', 'Overdue', 'Archived'] as const).map((t) => (
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
        <button className="btn-primary !py-1.5"><Plus size={14} /> New Invoice</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Outstanding" value={`MVR ${INVOICES.filter((i) => i.status !== 'Paid').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="warm" />
        <Stat label="Overdue" value={`MVR ${INVOICES.filter((i) => i.status === 'Overdue').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="hot" />
        <Stat label="Collected" value={`MVR ${INVOICES.filter((i) => i.status === 'Paid').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="win" />
        <Stat label="Active GST" value={`${taxRates.find((t) => t.name === 'Standard GST')?.rate}%`} variant="brand" />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-900/60 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Invoice #</th>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Insurer</th>
              <th className="text-left px-4 py-3 font-medium">Policy</th>
              <th className="text-left px-4 py-3 font-medium">Issue Date</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => {
              const t = computeTotals(inv);
              return (
                <tr key={inv.id} className="table-row">
                  <td className="px-4 py-3 font-mono text-brand-400">{inv.number}</td>
                  <td className="px-4 py-3 text-white">{inv.clientName}</td>
                  <td className="px-4 py-3 text-muted">{inv.insurer}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{inv.policyNo}</td>
                  <td className="px-4 py-3 text-muted text-xs">{new Date(inv.issueDate).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[inv.status]} dot>{inv.status}</Badge></td>
                  <td className="px-4 py-3 text-right text-white font-medium">{inv.currency} {t.total.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setSelected(inv)} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white" title="View"><Eye size={14} /></button>
                      <button className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white" title="Download"><Download size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Invoice ${selected?.number ?? ''}`}
        subtitle="Tax Invoice — Maldives MIRA compliant"
        size="lg"
        footer={
          <>
            <button className="btn-ghost"><Printer size={14} /> Print</button>
            <button className="btn-primary"><Download size={14} /> Download PDF</button>
          </>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-4 p-4 bg-ink-900/50 rounded-xl border border-ink-600">
              <div>
                <div className="text-white font-bold">{COMPANY.legalName}</div>
                <div className="text-xs text-muted mt-1">{COMPANY.address}</div>
                <div className="text-xs text-muted">{COMPANY.email} · {COMPANY.phone}</div>
                <div className="text-xs text-muted mt-1">Reg: {COMPANY.registration}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted">Bill To</div>
                <div className="text-white font-semibold">{selected.clientName}</div>
                <div className="text-xs text-muted">{selected.insurer}</div>
                <div className="text-xs text-muted font-mono mt-1">{selected.policyNo}</div>
                <div className="mt-2"><Badge variant={statusVariant[selected.status]} dot>{selected.status}</Badge></div>
              </div>
            </div>

            <div className="rounded-xl border border-ink-600 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-ink-800 text-muted text-[11px] uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Unit Price</th>
                    <th className="text-right px-3 py-2">VAT</th>
                    <th className="text-right px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it, i) => (
                    <tr key={i} className="border-t border-ink-700/60">
                      <td className="px-3 py-2 text-white">{it.description}</td>
                      <td className="px-3 py-2 text-right text-muted">{it.qty}</td>
                      <td className="px-3 py-2 text-right text-muted">{it.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted">{it.vatRate}%</td>
                      <td className="px-3 py-2 text-right text-white">{(it.unitPrice * it.qty).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted uppercase mb-2">Installment Schedule</div>
                  <div className="space-y-2">
                    {selected.installments.map((inst) => (
                      <div key={inst.id} className="flex items-center justify-between bg-ink-900/50 rounded-lg p-2.5 border border-ink-600">
                        <div>
                          <div className="text-sm text-white">{inst.label}</div>
                          <div className="text-[11px] text-muted">Due {new Date(inst.due).toLocaleDateString('en-GB')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-white font-medium">MVR {inst.amount.toLocaleString()}</div>
                          <Badge variant={inst.paid ? 'win' : 'warm'}>{inst.paid ? 'Paid' : 'Pending'}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted uppercase mb-1">Summary</div>
                <Row label="Subtotal" value={`MVR ${computeTotals(selected).subtotal.toLocaleString()}`} />
                <Row label="VAT / GST" value={`MVR ${computeTotals(selected).vat.toLocaleString()}`} />
                <div className="border-t border-ink-600 pt-2 flex justify-between text-white font-bold text-lg">
                  <span>Total</span><span>MVR {computeTotals(selected).total.toLocaleString()}</span>
                </div>
                <div className="mt-4 p-3 bg-ink-900/50 rounded-lg border border-ink-600 text-xs space-y-1">
                  <div className="text-muted uppercase text-[10px] mb-1">Remittance</div>
                  <div className="text-white">{BANK_DETAILS.bankName}</div>
                  <div className="text-muted">MVR: {BANK_DETAILS.mvrAccount}</div>
                  <div className="text-muted">USD: {BANK_DETAILS.usdAccount}</div>
                  <div className="text-muted">SWIFT: {BANK_DETAILS.swift}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: string; variant: 'warm' | 'hot' | 'win' | 'brand' }) {
  const c = { warm: 'text-warm', hot: 'text-hot', win: 'text-win', brand: 'text-brand-400' }[variant];
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-[11px] text-muted uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold mt-1 ${c}`}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
