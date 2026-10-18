import { useState } from 'react';
import { PRODUCT_CODES, INSURERS, CLIENTS } from '../data/seed';
import Modal from '../components/ui/Modal';
import { Plus, FileSliders, Send, X } from 'lucide-react';

const categories = ['Bonds', 'Engineering', 'Fire', 'Marine', 'Miscellaneous'];

const perilOptions = [
  'Property All Risk', 'Business Interruption', 'CGL', 'Terrorism',
  'Fidelity Guarantee', 'Money in Transit', 'Marine Hull',
];

export default function QSlipsPage() {
  const [open, setOpen] = useState(false);
  const [selectedPerils, setSelectedPerils] = useState<string[]>(['Property All Risk', 'Business Interruption']);
  const [activeCat, setActiveCat] = useState('Bonds');

  const togglePeril = (p: string) =>
    setSelectedPerils((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Quotation Request Slips</h2>
          <p className="text-sm text-muted">QRS 110-2024 · Multi-peril policy coverage requests</p>
        </div>
        <button className="btn-primary !py-1.5" onClick={() => setOpen(true)}><Plus size={14} /> New QRS</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase">Pending Slips</div>
          <div className="text-2xl font-bold text-warm mt-1">3</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase">Awaiting Insurer</div>
          <div className="text-2xl font-bold text-cold mt-1">2</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="text-xs text-muted uppercase">Quoted</div>
          <div className="text-2xl font-bold text-win mt-1">5</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-3">Recent Slips</h3>
        <div className="space-y-2">
          {CLIENTS.slice(0, 4).map((c, i) => (
            <div key={c.id} className="flex items-center justify-between bg-ink-900/40 rounded-lg p-3 border border-ink-700/60">
              <div className="flex items-center gap-3">
                <FileSliders size={16} className="text-brand-400" />
                <div>
                  <div className="text-sm text-white">QRS-110-2024-{String(1024 + i).slice(1)}</div>
                  <div className="text-[11px] text-muted">{c.name} · {c.productCode}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted">{new Date().toLocaleDateString('en-GB')}</span>
                <span className={`pill ${i < 2 ? 'bg-warm/15 text-warm border-warm/30' : 'bg-win/15 text-win border-win/30'}`}>
                  {i < 2 ? 'Pending' : 'Quoted'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Quotation Request Slip — QRS 110-2024"
        subtitle="Multi-peril policy coverage request"
        size="lg"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
            <button className="btn-primary" onClick={() => setOpen(false)}><Send size={14} /> Submit to Insurer</button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Client">
              <select className="input">
                {CLIENTS.map((c) => <option key={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Insurer">
              <select className="input">
                {INSURERS.map((i) => <option key={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Sum Insured (MVR)">
              <input className="input" type="number" placeholder="200,000" />
            </Field>
            <Field label="Policy Period">
              <input className="input" type="text" placeholder="12 months" />
            </Field>
          </div>

          <div>
            <div className="text-xs text-muted uppercase mb-2">Product Class</div>
            <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1 mb-3 overflow-x-auto no-scrollbar">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCat(c)}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition ${
                    activeCat === c ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRODUCT_CODES.filter((p) => p.category === activeCat).map((p) => (
                <div key={p.code} className="flex items-center gap-2 bg-ink-900/50 rounded-lg p-2.5 border border-ink-600">
                  <span className="font-mono text-xs text-brand-400 w-7">{p.code}</span>
                  <span className="text-xs text-white">{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase mb-2">Coverage / Perils</div>
            <div className="flex flex-wrap gap-2">
              {perilOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePeril(p)}
                  className={`pill border transition ${
                    selectedPerils.includes(p)
                      ? 'bg-brand-500 text-white border-brand-400'
                      : 'bg-ink-800 text-muted border-ink-600 hover:text-white'
                  }`}
                >
                  {selectedPerils.includes(p) && '✓ '}
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5">{label}</div>
      {children}
    </label>
  );
}
