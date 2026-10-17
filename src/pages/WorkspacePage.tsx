import { useMemo, useState } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  StickyNote,
  Send,
  FileText,
  Sparkles,
  Building2,
  Hash,
  Mail as MailIcon,
  Phone as PhoneIcon,
  MapPin,
  Briefcase,
  Wallet,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { deals, customer, commLog, quoteLineItems, getJurisdiction } from '@/data';
import { SectionHeader, Badge, MomentumRing } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { CommLogEntry } from '@/types';

const channelIcon = {
  whatsapp: MessageSquare,
  email: Mail,
  call: Phone,
  note: StickyNote,
};

const channelColor = {
  whatsapp: 'text-emerald-400 bg-accent-emerald/10',
  email: 'text-indigo-300 bg-accent-indigo/10',
  call: 'text-amber-300 bg-accent-amber/10',
  note: 'text-slate-300 bg-base-raised/60',
};

export function WorkspacePage() {
  const [dealId, setDealId] = useState('D-2041');
  const deal = useMemo(() => deals.find((d) => d.id === dealId)!, [dealId]);
  const jurisdiction = getJurisdiction(deal.jurisdictionCode);

  const quoteSubtotal = useMemo(
    () => quoteLineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    [],
  );
  const quoteTax = Math.round((quoteSubtotal * 8) / 100);
  const quoteTotal = quoteSubtotal + quoteTax;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">Deal Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">Customer · omnichannel feed · CPQ quote preview</p>
        </div>
        <select
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          className="glass-input px-3 py-2 text-[13px] w-56"
        >
          {deals.map((d) => (
            <option key={d.id} value={d.id} className="bg-base-nav text-slate-200">
              {d.id} — {d.company}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Pane 1: Customer record */}
        <div className="xl:col-span-3 space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-indigo to-accent-emerald flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-slate-100 truncate">{deal.company}</p>
                <p className="text-[11px] text-slate-500">{deal.contact}</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <DetailRow icon={Hash} label="Tax ID" value={customer.taxId} />
              <DetailRow icon={MailIcon} label="Email" value={customer.email} />
              <DetailRow icon={PhoneIcon} label="Phone" value={customer.phone} />
              <DetailRow icon={MapPin} label="Location" value={customer.country} />
              <DetailRow icon={Briefcase} label="Industry" value={customer.industry} />
              <DetailRow
                icon={Wallet}
                label="LTV"
                value={formatCurrency(customer.lifetimeValue, deal.currency, true)}
              />
            </div>

            <div className="mt-4 pt-4 border-t border-base-border/40">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Momentum</p>
                <MomentumRing score={deal.momentum} size={40} />
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <SectionHeader title="Deal Snapshot" />
            <div className="space-y-2.5">
              <DetailRow icon={Wallet} label="Value" value={formatCurrency(deal.value, deal.currency)} />
              <DetailRow icon={Clock} label="Stage" value={deal.stage} />
              <DetailRow icon={MapPin} label="Region" value={deal.region} />
              <DetailRow icon={Hash} label="Close target" value={deal.closeTarget} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {deal.tags.map((t) => (
                <Badge key={t} tone="indigo">
                  {t}
                </Badge>
              ))}
            </div>
            {deal.riskFlags.length > 0 && (
              <div className="mt-3 p-2.5 rounded-lg bg-accent-crimson/10 border border-accent-crimson/30">
                <p className="text-[11px] text-rose-300">{deal.riskFlags[0]}</p>
              </div>
            )}
          </div>
        </div>

        {/* Pane 2: Omnichannel feed */}
        <div className="xl:col-span-5 glass-card p-5 flex flex-col" style={{ minHeight: '70vh' }}>
          <SectionHeader
            title="Omnichannel Communication"
            subtitle="WhatsApp · Email · Call · Notes"
            action={
              <Badge tone="emerald" size="sm">
                {commLog.length} messages
              </Badge>
            }
          />
          <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {commLog.map((entry: CommLogEntry) => {
              const Icon = channelIcon[entry.channel];
              return (
                <div key={entry.id} className="flex gap-3 animate-fade-in">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${channelColor[entry.channel]}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-xl bg-base-nav/40 border border-base-border/40 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-semibold text-slate-200 truncate">
                        {entry.from}
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0">{entry.timestamp}</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">{entry.body}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-base-border/40">
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1">
                {(['whatsapp', 'email', 'call', 'note'] as const).map((ch) => {
                  const Icon = channelIcon[ch];
                  return (
                    <button
                      key={ch}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-base-raised/50 transition-colors"
                      title={ch}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <textarea
                rows={1}
                placeholder="Type a message or log a note…"
                className="glass-input flex-1 px-3 py-2 text-[13px] resize-none placeholder:text-slate-600"
              />
              <button className="p-2.5 rounded-lg bg-accent-indigo text-white hover:bg-accent-indigo/90 transition-colors shadow-glow">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Pane 3: CPQ quote preview */}
        <div className="xl:col-span-4 space-y-4">
          <div className="glass-card p-5">
            <SectionHeader
              title="CPQ Quote Generator"
              subtitle={`Draft · ${jurisdiction.flag} ${jurisdiction.name}`}
              action={
                <button className="flex items-center gap-1 text-[11px] text-accent-indigo hover:underline">
                  <FileText className="w-3.5 h-3.5" /> Full quote
                </button>
              }
            />

            <div className="rounded-xl border border-base-border/50 bg-base-nav/30 p-4">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-base-border/40">
                <div>
                  <p className="text-[11px] text-slate-500">Quote #</p>
                  <p className="text-[13px] font-mono text-accent-indigo">
                    QT-{deal.id.replace('D-', '')}-{new Date().getFullYear()}
                  </p>
                </div>
                <Badge tone="amber">Draft</Badge>
              </div>

              <div className="space-y-2 mb-3">
                {quoteLineItems.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-[12px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-300 truncate">{it.description}</p>
                      <p className="text-[10px] text-slate-600">
                        {it.qty} × {formatCurrency(it.unitPrice, deal.currency)}
                      </p>
                    </div>
                    <span className="font-mono text-slate-200 shrink-0">
                      {formatCurrency(it.qty * it.unitPrice, deal.currency, true)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="h-px bg-base-border/50 my-3" />

              <div className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-mono text-slate-300">
                    {formatCurrency(quoteSubtotal, deal.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-500">GST (8%)</span>
                  <span className="font-mono text-slate-300">
                    {formatCurrency(quoteTax, deal.currency)}
                  </span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-[13px] font-semibold text-slate-100">Total</span>
                  <span className="text-[15px] font-mono font-semibold gradient-text">
                    {formatCurrency(quoteTotal, deal.currency)}
                  </span>
                </div>
              </div>
            </div>

            <button className="w-full mt-4 py-2.5 rounded-xl bg-accent-indigo/15 border border-accent-indigo/30 text-indigo-200 text-[12px] font-medium hover:bg-accent-indigo/25 transition-colors flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> Generate AI quote variant
            </button>
          </div>

          <div className="glass-card p-5">
            <SectionHeader title="AI Copilot Suggestions" />
            <div className="space-y-2.5">
              <Suggestion
                title="Itemize GST module"
                detail="Finance requested separate MIRA GST line item for approval."
              />
              <Suggestion
                title="Send 3-yr SaaS tier"
                detail="Board signal indicates openness to multi-year commitment."
              />
              <Suggestion
                title="Re-engage by Friday"
                detail="Procurement SOW deadline approaching for {deal.company}."
              />
            </div>
            <button className="w-full mt-3 py-2 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 hover:bg-base-raised/40 transition-colors flex items-center justify-center gap-1.5">
              View all insights <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
      <span className="text-[11px] text-slate-500 w-16 shrink-0">{label}</span>
      <span className="text-[12px] text-slate-200 truncate">{value}</span>
    </div>
  );
}

function Suggestion({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="p-3 rounded-lg bg-accent-indigo/5 border border-accent-indigo/20 hover:border-accent-indigo/40 transition-colors">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-accent-indigo mt-0.5 shrink-0" />
        <div>
          <p className="text-[12px] font-medium text-slate-200">{title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{detail}</p>
        </div>
      </div>
    </div>
  );
}
