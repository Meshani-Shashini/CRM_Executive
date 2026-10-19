import { useState } from 'react';
import { PRODUCT_CODES, INSURERS } from '../data/catalogs';
import Modal from '../components/ui/Modal';
import { useApp } from '../store/AppContext';
import { Plus, Send, X } from 'lucide-react';

const categories = ['Bonds', 'Engineering', 'Fire', 'Marine', 'Miscellaneous'];
const perilOptions = [
  'Property All Risk', 'Business Interruption', 'CGL', 'Terrorism',
  'Fidelity Guarantee', 'Money in Transit', 'Marine Hull',
];

export default function QSlipsPage() {
  const { clients } = useApp();
  const [open, setOpen] = useState(false);
  const [selectedPerils, setSelectedPerils] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const togglePeril = (peril: string) =>
    setSelectedPerils((current) => current.includes(peril)
      ? current.filter((item) => item !== peril)
      : [...current, peril]);
  const openNew = () => {
    setSelectedPerils([]);
    setActiveCat('');
    setOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Quotation Request Slips</h2>
          <p className="text-sm text-muted">Multi-peril policy coverage requests</p>
        </div>
        <button className="btn-primary !py-1.5" onClick={openNew}><Plus size={14} /> New QRS</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SlipCount label="Pending Slips" value={0} color="text-warm" />
        <SlipCount label="Awaiting Insurer" value={0} color="text-cold" />
        <SlipCount label="Quoted" value={0} color="text-win" />
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-3">Recent Slips</h3>
        <p className="text-sm text-muted">No quotation request slips yet.</p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Quotation Request Slip"
        subtitle="Multi-peril policy coverage request"
        size="lg"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}><X size={14} /> Cancel</button>
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}><Send size={14} /> Submit to Insurer</button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Client">
              <select className="input" required defaultValue="">
                <option value="">Select client</option>
                {clients.map((client) => <option key={client.id}>{client.name}</option>)}
              </select>
            </Field>
            <Field label="Insurer">
              <select className="input" required defaultValue="">
                <option value="">Select insurer</option>
                {INSURERS.map((insurer) => <option key={insurer.id}>{insurer.name}</option>)}
              </select>
            </Field>
            <Field label="Sum Insured (MVR)">
              <input className="input" type="number" min="0" step="0.01" required />
            </Field>
            <Field label="Policy Period">
              <input className="input" type="text" required />
            </Field>
          </div>

          <div>
            <div className="text-xs text-muted uppercase mb-2">Product Class</div>
            <div className="flex gap-1 bg-ink-800/60 border border-ink-600 rounded-lg p-1 mb-3 overflow-x-auto no-scrollbar">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCat(category)}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition ${
                    activeCat === category ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRODUCT_CODES.filter((product) => product.category === activeCat).map((product) => (
                <div key={product.code} className="flex items-center gap-2 bg-ink-900/50 rounded-lg p-2.5 border border-ink-600">
                  <span className="font-mono text-xs text-brand-400 w-7">{product.code}</span>
                  <span className="text-xs text-white">{product.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase mb-2">Coverage / Perils</div>
            <div className="flex flex-wrap gap-2">
              {perilOptions.map((peril) => (
                <button
                  key={peril}
                  type="button"
                  onClick={() => togglePeril(peril)}
                  className={`pill border transition ${
                    selectedPerils.includes(peril)
                      ? 'bg-brand-500 text-white border-brand-400'
                      : 'bg-ink-800 text-muted border-ink-600 hover:text-white'
                  }`}
                >
                  {selectedPerils.includes(peril) && '✓ '}
                  {peril}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SlipCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs text-muted uppercase">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted mb-1.5">{label}</div>{children}</label>;
}
