import { useMemo, useState } from 'react';
import {
  Globe2,
  ShieldCheck,
  FileText,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { jurisdictions, deals } from '@/data';
import { SectionHeader, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { Jurisdiction } from '@/types';

export function CompliancePage() {
  const [active, setActive] = useState<Jurisdiction>(jurisdictions[0]);
  const [customer, setCustomer] = useState('Villa Resorts International');
  const [taxRate, setTaxRate] = useState(active.taxRates[0].rate);
  const [seq, setSeq] = useState(1);
  const [year] = useState(2026);
  const [items, setItems] = useState([
    { description: 'Enterprise Resort Suite — Annual', qty: 1, unitPrice: 540000 },
    { description: 'MIRA GST Compliance Module', qty: 1, unitPrice: 95000 },
  ]);

  const invoiceNumber = useMemo(() => {
    const prefix = active.code === 'MV' ? 'INV-MV' : `INV-${active.code}`;
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }, [active, year, seq]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    [items],
  );
  const taxAmount = useMemo(() => Math.round((subtotal * taxRate) / 100), [subtotal, taxRate]);
  const total = subtotal + taxAmount;

  function selectJurisdiction(j: Jurisdiction) {
    setActive(j);
    setTaxRate(j.taxRates[0].rate);
    setSeq(1);
  }

  function updateItem(idx: number, field: 'description' | 'qty' | 'unitPrice', value: string | number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx
          ? { ...it, [field]: field === 'description' ? String(value) : Number(value) || 0 }
          : it,
      ),
    );
  }

  const jurisdictionDeals = deals.filter((d) => d.jurisdictionCode === active.code);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
          Jurisdiction &amp; Compliance Config
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Multi-jurisdiction tax rules · MIRA continuous sequential invoicing simulator
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 space-y-4">
          <div className="glass-card p-5">
            <SectionHeader
              title="Active Jurisdiction"
              subtitle="Select region to load tax rules"
              action={<Globe2 className="w-4 h-4 text-accent-indigo" />}
            />
            <div className="space-y-2">
              {jurisdictions.map((j) => {
                const isActive = active.code === j.code;
                return (
                  <button
                    key={j.code}
                    onClick={() => selectJurisdiction(j)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'bg-accent-indigo/15 border-accent-indigo/40 shadow-glow'
                        : 'bg-base-nav/40 border-base-border/40 hover:border-base-border/80'
                    }`}
                  >
                    <span className="text-2xl">{j.flag}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-100">{j.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {j.currency} ({j.currencySymbol}) · {j.code}
                      </p>
                    </div>
                    {isActive && <CheckCircle2 className="w-4 h-4 text-accent-indigo" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-card p-5">
            <SectionHeader
              title={`${active.flag} ${active.name} Tax Rules`}
              action={<ShieldCheck className="w-4 h-4 text-accent-emerald" />}
            />
            <div className="space-y-2">
              {active.taxRates.map((t) => (
                <div
                  key={t.label}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-base-nav/40 border border-base-border/40"
                >
                  <span className="text-[12px] text-slate-300">{t.label}</span>
                  <Badge tone={t.rate === 0 ? 'neutral' : 'emerald'}>{t.rate}%</Badge>
                </div>
              ))}
            </div>
            {active.code === 'MV' && (
              <div className="mt-4 p-3 rounded-lg bg-accent-amber/10 border border-accent-amber/30">
                <p className="text-[11px] text-amber-300 leading-relaxed">
                  Maldives MIRA: tourism sector services taxed at 17% GST, general goods/services at 8%.
                  Tax invoices must follow continuous sequential numbering.
                </p>
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <SectionHeader title="Deals in Jurisdiction" />
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {jurisdictionDeals.length === 0 ? (
                <p className="text-[12px] text-slate-500 py-4 text-center">No deals in this region.</p>
              ) : (
                jurisdictionDeals.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-base-nav/40 border border-base-border/40"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-slate-200 truncate">{d.company}</p>
                      <p className="text-[10px] text-slate-500">{d.id}</p>
                    </div>
                    <span className="text-[12px] font-mono text-slate-300">
                      {formatCurrency(d.value, d.currency, true)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 glass-card p-5">
          <SectionHeader
            title="Tax Invoice & Payment Receipt Generator"
            subtitle="MIRA continuous sequential numbering · live preview"
            action={
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-base-raised/60 text-slate-300 text-[11px] hover:bg-base-raised transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-indigo text-white text-[11px] hover:bg-accent-indigo/90 transition-colors">
                  <Receipt className="w-3.5 h-3.5" /> Issue
                </button>
              </div>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Customer
              </label>
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="glass-input w-full mt-1.5 px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Invoice Number
              </label>
              <div className="glass-input w-full mt-1.5 px-3 py-2 text-[13px] font-mono text-accent-indigo flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                {invoiceNumber}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Sequence #
              </label>
              <input
                type="number"
                min={1}
                value={seq}
                onChange={(e) => setSeq(Math.max(1, Number(e.target.value)))}
                className="glass-input w-full mt-1.5 px-3 py-2 text-[13px] font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Tax Rate
              </label>
              <select
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="glass-input w-full mt-1.5 px-3 py-2 text-[13px]"
              >
                {active.taxRates.map((t) => (
                  <option key={t.label} value={t.rate} className="bg-base-nav text-slate-200">
                    {t.label} — {t.rate}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Date
              </label>
              <input
                type="date"
                defaultValue="2026-10-17"
                className="glass-input w-full mt-1.5 px-3 py-2 text-[13px]"
              />
            </div>
          </div>

          <div className="rounded-xl border border-base-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-base-nav/60">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 font-medium text-right w-20">Qty</th>
                  <th className="px-3 py-2.5 font-medium text-right w-32">Unit Price</th>
                  <th className="px-3 py-2.5 font-medium text-right w-32">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border/30">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-base-raised/20">
                    <td className="px-3 py-2">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        className="bg-transparent w-full text-[12px] text-slate-200 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={it.qty}
                        onChange={(e) => updateItem(i, 'qty', e.target.value)}
                        className="bg-transparent w-full text-right text-[12px] font-mono text-slate-300 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={it.unitPrice}
                        onChange={(e) => updateItem(i, 'unitPrice', e.target.value)}
                        className="bg-transparent w-full text-right text-[12px] font-mono text-slate-300 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-mono text-slate-200">
                      {formatCurrency(it.qty * it.unitPrice, active.currency)}
                    </td>
                    <td className="px-2">
                      <button
                        onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded text-slate-600 hover:text-accent-crimson transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() =>
                setItems((prev) => [...prev, { description: '', qty: 1, unitPrice: 0 }])
              }
              className="w-full py-2.5 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-base-raised/20 transition-colors flex items-center justify-center gap-1.5 border-t border-base-border/30"
            >
              <Plus className="w-3.5 h-3.5" /> Add line item
            </button>
          </div>

          <div className="flex justify-end mt-5">
            <div className="w-full md:w-72 space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-mono text-slate-200">{formatCurrency(subtotal, active.currency)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-400">
                  GST/Tax ({taxRate}%)
                </span>
                <span className="font-mono text-slate-200">{formatCurrency(taxAmount, active.currency)}</span>
              </div>
              <div className="h-px bg-base-border/50" />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[14px] font-semibold text-slate-100">Total</span>
                <span className="text-lg font-mono font-semibold gradient-text">
                  {formatCurrency(total, active.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
