import { useState, type FormEvent } from 'react';
import { useApp } from '../store/AppContext';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { Plus, CreditCard, Download, TrendingUp, X } from 'lucide-react';
import type { Payment } from '../types';
import { downloadCsv } from '../utils/downloadCsv';

export default function PaymentsPage() {
  const { payments, setPayments, invoices, setInvoices } = useApp();
  const [tab, setTab] = useState<'all' | 'Premium' | 'Commission' | 'Fee'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const filtered = tab === 'all' ? payments : payments.filter((p) => p.type === tab);
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const commissionTotal = payments.filter((p) => p.type === 'Commission').reduce((s, p) => s + p.amount, 0);
  const pendingCount = payments.filter((payment) => payment.status === 'Pending').length;

  const recordPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const invoice = invoices.find((item) => item.id === data.get('invoiceId'));
    if (!invoice) return;
    const amount = Number(data.get('amount'));
    const payment: Payment = {
      id: `p-${Date.now()}`,
      receiptNo: `RCP-${new Date().getFullYear()}-${String(payments.length + 1).padStart(4, '0')}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientName: invoice.clientName,
      amount,
      date: String(data.get('date')),
      type: data.get('type') as Payment['type'],
      method: data.get('method') as Payment['method'],
      status: 'Completed',
    };
    setPayments([payment, ...payments]);
    const invoiceTotal = invoice.items.reduce((sum, item) => sum + item.qty * item.unitPrice * (1 + item.vatRate / 100), 0);
    const alreadyPaid = payments.filter((item) => item.invoiceId === invoice.id).reduce((sum, item) => sum + item.amount, 0);
    if (alreadyPaid + amount >= invoiceTotal) {
      setInvoices(invoices.map((item) => item.id === invoice.id ? { ...item, status: 'Paid', installments: item.installments.map((installment) => ({ ...installment, paid: true })) } : item));
    } else if (alreadyPaid + amount > 0) {
      setInvoices(invoices.map((item) => item.id === invoice.id && item.status !== 'Paid' ? { ...item, status: 'Partial' } : item));
    }
    setCreateOpen(false);
  };

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
          <div className="text-2xl font-bold text-warm mt-1">{pendingCount}</div>
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
        <button className="btn-primary !py-1.5" onClick={() => setCreateOpen(true)} disabled={!invoices.some((invoice) => invoice.status !== 'Paid')} title={invoices.some((invoice) => invoice.status !== 'Paid') ? undefined : 'All invoices are paid'}><Plus size={14} /> Record Payment</button>
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
                  <button onClick={() => downloadCsv(`${p.receiptNo}.csv`, ['Receipt #', 'Invoice #', 'Client', 'Amount', 'Type', 'Method', 'Date', 'Status'], [[p.receiptNo, p.invoiceNumber, p.clientName, p.amount, p.type, p.method, p.date, p.status]])} aria-label={`Download receipt ${p.receiptNo}`} className="p-1.5 rounded-md hover:bg-ink-700 text-muted hover:text-white"><Download size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Record Payment" subtitle="Record a payment against an invoice." footer={<><button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}><X size={14} /> Cancel</button><button type="submit" form="record-payment-form" className="btn-primary"><Plus size={14} /> Record Payment</button></>}>
        <form id="record-payment-form" onSubmit={recordPayment} className="space-y-3">
          <Field label="Invoice"><select className="input" name="invoiceId" required>{invoices.filter((invoice) => invoice.status !== 'Paid').map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {invoice.clientName}</option>)}</select></Field>
          <Field label="Amount (MVR)"><input className="input" type="number" name="amount" min="0.01" step="0.01" required /></Field>
          <Field label="Payment type"><select className="input" name="type"><option>Premium</option><option>Commission</option><option>Fee</option></select></Field>
          <Field label="Method"><select className="input" name="method"><option>Bank Transfer</option><option>Cash</option><option>Card</option></select></Field>
          <Field label="Date"><input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
