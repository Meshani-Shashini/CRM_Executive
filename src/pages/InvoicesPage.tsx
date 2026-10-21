import { useEffect, useState, type FormEvent } from 'react';
import { BANK_DETAILS } from '../data/catalogs';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { Download, Eye, Plus, Printer, X } from 'lucide-react';
import type { Invoice } from '../types';
import { downloadCsv } from '../utils/downloadCsv';
import { hashParams } from '../utils/navigation';

const statusVariant: Record<string, 'win' | 'warm' | 'hot' | 'cold' | 'muted'> = {
  Paid: 'win', Partial: 'warm', Pending: 'cold', Overdue: 'hot', Archived: 'muted',
};

export default function InvoicesPage() {
  const { taxRates, invoices, setInvoices, clients, company } = useApp();
  const [tab, setTab] = useState<'all' | 'outstanding' | 'Pending' | 'Paid' | 'Overdue' | 'Archived'>(() => {
    const status = hashParams().get('status');
    return status === 'outstanding' || status === 'Pending' || status === 'Paid' || status === 'Overdue' || status === 'Archived' ? status : 'all';
  });
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const applyHashFilter = () => {
      const status = hashParams().get('status');
      setTab(status === 'outstanding' || status === 'Pending' || status === 'Paid' || status === 'Overdue' || status === 'Archived' ? status : 'all');
    };
    window.addEventListener('hashchange', applyHashFilter);
    return () => window.removeEventListener('hashchange', applyHashFilter);
  }, []);

  const filtered = tab === 'all'
    ? invoices
    : tab === 'outstanding'
      ? invoices.filter((i) => i.status !== 'Paid')
      : invoices.filter((i) => i.status === tab);

  const computeTotals = (inv: Invoice) => {
    const subtotal = inv.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const vat = inv.items.reduce((s, it) => s + it.unitPrice * it.qty * (it.vatRate / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  };

  const createInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const client = clients.find((item) => item.id === data.get('clientId'));
    if (!client) return;
    const amount = Number(data.get('amount'));
    const issueDate = String(data.get('issueDate'));
    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      number: `INV-${String(invoices.length + 1).padStart(3, '0')}-${new Date(issueDate).getFullYear()}`,
      clientId: client.id,
      clientName: client.name,
      insurer: client.insurer,
      policyNo: `${client.productCode}-${client.id}-${new Date(issueDate).getFullYear()}`,
      issueDate,
      dueDate: String(data.get('dueDate')),
      status: 'Pending',
      items: [{ description: String(data.get('description')).trim(), qty: 1, unitPrice: amount, vatRate: taxRates.find((rate) => rate.active && rate.category === 'Standard')?.rate ?? 0 }],
      installments: [{ id: `inst-${Date.now()}`, label: 'Single Payment', due: String(data.get('dueDate')), amount, paid: false }],
      currency: 'MVR',
    };
    setInvoices([invoice, ...invoices]);
    setSelected(invoice);
    setTab('all');
    setCreateOpen(false);
  };

  const downloadInvoice = (invoice: Invoice) => {
    const totals = computeTotals(invoice);
    downloadCsv(`${invoice.number}.csv`, ['Invoice #', 'Client', 'Insurer', 'Policy', 'Issue Date', 'Due Date', 'Status', 'Subtotal', 'VAT', 'Total'], [[invoice.number, invoice.clientName, invoice.insurer, invoice.policyNo, invoice.issueDate, invoice.dueDate, invoice.status, totals.subtotal, totals.vat, totals.total]]);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1">
          {(['all', 'outstanding', 'Pending', 'Paid', 'Overdue', 'Archived'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
              }`}
            >
                {t === 'all' ? 'All' : t === 'outstanding' ? 'Outstanding' : t}
            </button>
          ))}
        </div>
        <button className="btn-primary !py-1.5" onClick={() => setCreateOpen(true)}><Plus size={14} /> New Invoice</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Outstanding" value={`MVR ${invoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="warm" />
        <Stat label="Overdue" value={`MVR ${invoices.filter((i) => i.status === 'Overdue').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="hot" />
        <Stat label="Collected" value={`MVR ${invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + computeTotals(i).total, 0).toLocaleString()}`} variant="win" />
        <Stat label="Active GST" value={`${taxRates.find((t) => t.name === 'Standard GST')?.rate ?? '—'}%`} variant="brand" />
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
                      <button onClick={() => downloadInvoice(inv)} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white" title="Download CSV" aria-label={`Download ${inv.number}`}><Download size={14} /></button>
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
            <button className="btn-ghost" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="btn-primary" onClick={() => selected && downloadInvoice(selected)}><Download size={14} /> Download CSV</button>
          </>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-4 p-4 bg-ink-900/50 rounded-xl border border-ink-600">
              <div>
                <div className="text-white font-bold">{company.legalName}</div>
                <div className="text-xs text-muted mt-1">{company.address}</div>
                <div className="text-xs text-muted">{company.email} · {company.phone}</div>
                <div className="text-xs text-muted mt-1">Reg: {company.registration}</div>
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
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Invoice" subtitle="Create an invoice for a client." footer={<><button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}><X size={14} /> Cancel</button><button type="submit" form="new-invoice-form" className="btn-primary"><Plus size={14} /> Create Invoice</button></>}>
        <form id="new-invoice-form" onSubmit={createInvoice} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client"><select className="input" name="clientId" required>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Description"><input className="input" name="description" required /></Field>
          <Field label="Amount (MVR)"><input className="input" type="number" name="amount" min="0.01" step="0.01" required /></Field>
          <Field label="Issue date"><input className="input" type="date" name="issueDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
          <Field label="Due date"><input className="input" type="date" name="dueDate" required /></Field>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
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
