import { useEffect, useState, type FormEvent } from 'react';
import { INSURERS, PRODUCT_CODES } from '../data/catalogs';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Plus, Filter, X } from 'lucide-react';
import type { Deal } from '../types';
import { DEFAULT_USD_TO_MVR_RATE, formatAmount, toMvr, type Currency } from '../utils/currency';
import { hashParams } from '../utils/navigation';

const stageColors: Record<string, 'cold' | 'warm' | 'win' | 'hot'> = {
  'Lead Identified': 'cold',
  'Contact Made': 'cold',
  'Key Person Identified': 'warm',
  Quoted: 'warm',
  'Internal Slip': 'hot',
};

export default function DealsPage() {
  const { deals, setDeals, clients, user, pipelines, pipelineStages } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [createPipelineId, setCreatePipelineId] = useState('');
  const [dealCurrency, setDealCurrency] = useState<Currency | ''>('');
  const [dealAmount, setDealAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [createError, setCreateError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState(() => hashParams().get('stage') ?? '');
  const [dealFilter, setDealFilter] = useState(() => hashParams().get('filter') ?? '');
  const [dealIdFilter, setDealIdFilter] = useState(() => hashParams().get('id') ?? '');
  useEffect(() => {
    const applyHashFilters = () => {
      const params = hashParams();
      setStageFilter(params.get('stage') ?? '');
      setDealFilter(params.get('filter') ?? '');
      setDealIdFilter(params.get('id') ?? '');
    };
    window.addEventListener('hashchange', applyHashFilters);
    return () => window.removeEventListener('hashchange', applyHashFilters);
  }, []);
  const visibleDeals = deals.filter((deal) => {
    if (stageFilter && deal.stage !== stageFilter) return false;
    if (dealIdFilter && deal.id !== dealIdFilter) return false;
    if (dealFilter === 'won') {
      if (deal.disposition) return deal.disposition === 'won';
      const stage = deal.stage.trim().toLowerCase();
      return stage.includes('won') || stage.includes('bound') || stage.includes('renewed') || stage === 'policy issued';
    }
    return true;
  });
  const activePipelines = pipelines.filter((pipeline) => pipeline.isActive);
  const availableStages = pipelineStages
    .filter((stage) => stage.pipelineId === createPipelineId)
    .sort((a, b) => a.stageOrder - b.stageOrder);
  const totalValue = deals.reduce((sum, deal) => sum + toMvr(deal.value, deal.currency, deal.exchangeRate), 0);
  const totalWeighted = deals.reduce((sum, deal) => sum + toMvr(deal.weighted, deal.currency, deal.exchangeRate), 0);

  const openCreate = () => {
    setCreatePipelineId('');
    setDealCurrency('');
    setDealAmount('');
    setExchangeRate('');
    setCreateError('');
    setCreateOpen(true);
  };

  const createDeal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Number(data.get('value'));
    const probability = Number(data.get('probability'));
    const currency = String(data.get('currency')) as Currency;
    const rate = currency === 'USD' ? Number(data.get('exchangeRate')) : undefined;
    if (currency === 'USD' && (!Number.isFinite(rate) || !rate || rate <= 0)) {
      setCreateError('Enter a valid positive exchange rate.');
      return;
    }
    const deal: Deal = {
      id: `d-${Date.now()}`,
      pipelineId: String(data.get('pipelineId')),
      createdAt: new Date().toISOString(),
      client: String(data.get('client')),
      product: String(data.get('product')),
      value,
      weighted: Math.round(value * probability) / 100,
      currency,
      ...(rate ? { exchangeRate: rate } : {}),
      stage: String(data.get('stage')),
      probability,
      ownerId: user.id,
      closeDate: String(data.get('closeDate')),
      insurer: String(data.get('insurer')),
      intentTier: String(data.get('intentTier')) as Deal['intentTier'],
      nextActivityAt: String(data.get('nextActivityAt') ?? '') || undefined,
      nextActivityTitle: String(data.get('nextActivityTitle') ?? '').trim() || undefined,
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
            <button className="btn-primary !py-1.5" onClick={openCreate} disabled={activePipelines.length === 0} title={activePipelines.length === 0 ? 'Create an active pipeline before adding deals' : undefined}><Plus size={14} /> New Deal</button>
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
                <td className="px-4 py-3 text-right text-white">
                  <div>{formatAmount(d.value, d.currency)}</div>
                  {d.currency === 'USD' && <div className="text-[11px] text-muted">{formatAmount(toMvr(d.value, d.currency, d.exchangeRate), 'MVR')}</div>}
                </td>
                <td className="px-4 py-3 text-right text-brand-400 font-medium">
                  <div>{formatAmount(d.weighted, d.currency)}</div>
                  {d.currency === 'USD' && <div className="text-[11px] text-muted">{formatAmount(toMvr(d.weighted, d.currency, d.exchangeRate), 'MVR')}</div>}
                </td>
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
          <Field label="Pipeline"><select className="input" name="pipelineId" required value={createPipelineId} onChange={(event) => setCreatePipelineId(event.target.value)}><option value="">Select pipeline</option>{activePipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></Field>
          <Field label="Client"><select className="input" name="client" required defaultValue=""><option value="">Select client</option>{clients.map((client) => <option key={client.id}>{client.name}</option>)}</select></Field>
          <Field label="Product"><select className="input" name="product" required defaultValue=""><option value="">Select product</option>{PRODUCT_CODES.map((product) => <option key={product.code}>{product.name}</option>)}</select></Field>
          <Field label="Insurer"><select className="input" name="insurer" required defaultValue=""><option value="">Select insurer</option>{INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}</select></Field>
          <Field label="Stage"><select className="input" name="stage" required defaultValue=""><option value="">Select stage</option>{availableStages.map((stage) => <option key={stage.id}>{stage.name}</option>)}</select></Field>
          <Field label="Currency"><select className="input" name="currency" required value={dealCurrency} onChange={(event) => { const currency = event.target.value as Currency | ''; setDealCurrency(currency); setDealAmount(''); setExchangeRate(currency === 'USD' ? String(DEFAULT_USD_TO_MVR_RATE) : ''); }}><option value="">Select currency</option><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
          <Field label={`Deal Value${dealCurrency ? ` (${dealCurrency})` : ''}`}><input className="input" name="value" type="number" min="0" step="0.01" required value={dealAmount} onChange={(event) => setDealAmount(event.target.value)} /></Field>
          {dealCurrency === 'USD' && <Field label="Exchange rate (1 USD = MVR)"><input className="input" name="exchangeRate" type="number" min="0.000001" step="any" required value={exchangeRate} onChange={(event) => { setExchangeRate(event.target.value); setCreateError(''); }} /></Field>}
          {dealCurrency === 'USD' && Number(dealAmount) > 0 && Number(exchangeRate) > 0 && <p className="sm:col-span-2 text-sm text-muted">Equivalent: {formatAmount(toMvr(Number(dealAmount), 'USD', Number(exchangeRate)), 'MVR')}</p>}
          {createError && <p role="alert" className="sm:col-span-2 text-sm text-hot">{createError}</p>}
          <Field label="Probability (%)"><input className="input" name="probability" type="number" min="0" max="100" step="0.01" required /></Field>
          <Field label="Intent Tier">
            <select className="input" name="intentTier" required defaultValue="P3">
              <option value="P1">P1 · Ready to Buy</option>
              <option value="P2">P2 · Evaluating</option>
              <option value="P3">P3 · Nurture</option>
            </select>
          </Field>
          <Field label="Expected Close"><input className="input" name="closeDate" type="date" required /></Field>
          <Field label="Next activity date"><input className="input" name="nextActivityAt" type="date" /></Field>
          <Field label="Next activity"><input className="input" name="nextActivityTitle" placeholder="e.g. Call client for documents" maxLength={120} /></Field>
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
