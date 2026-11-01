import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Flame, Snowflake, Sun } from 'lucide-react';
import type { LeadTemperature } from '../types';

const tableBadgeClass = 'pill pill-compact border';

const temperatureOptions: { value: LeadTemperature; Icon: typeof Flame; className: string; menuClassName: string }[] = [
  { value: 'HOT', Icon: Flame, className: 'border-hot/50 bg-hot/10 text-hot shadow-[0_0_8px_rgba(239,68,68,0.18)]', menuClassName: 'text-hot' },
  { value: 'WARM', Icon: Sun, className: 'border-amber-400/50 bg-amber-500/10 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.16)]', menuClassName: 'text-amber-300' },
  { value: 'COLD', Icon: Snowflake, className: 'border-blue-400/50 bg-blue-500/10 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.22)]', menuClassName: 'text-blue-300' },
];

export default function LeadTemperatureControl({
  leadName,
  temperature,
  disabled,
  onChange,
}: {
  leadName: string;
  temperature: LeadTemperature;
  disabled: boolean;
  onChange: (temperature: LeadTemperature) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingTemperature, setPendingTemperature] = useState<LeadTemperature | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmationTitleId = useId();
  const selected = temperatureOptions.find((option) => option.value === temperature) ?? temperatureOptions[1];
  const TemperatureIcon = selected.Icon;

  useEffect(() => {
    if (pendingTemperature) cancelRef.current?.focus();
  }, [pendingTemperature]);

  useEffect(() => {
    if (!open && !pendingTemperature) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPendingTemperature(null);
        triggerRef.current?.focus();
      }
    };
    if (open) document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, pendingTemperature]);

  const confirmTemperatureChange = () => {
    if (disabled || !pendingTemperature || pendingTemperature === temperature) {
      dismissConfirmation();
      return;
    }
    onChange(pendingTemperature);
    dismissConfirmation();
  };

  const dismissConfirmation = () => {
    setPendingTemperature(null);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Change ${leadName} temperature`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={`${temperature} lead temperature`}
        onClick={() => setOpen((current) => !current)}
        className={`${tableBadgeClass} transition-all hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 disabled:cursor-not-allowed disabled:opacity-60 ${selected.className}`}
      >
        <TemperatureIcon size={12} className="shrink-0" aria-hidden="true" />
        <span>{temperature}</span>
      </button>
      {open && <div role="menu" aria-label={`${leadName} temperature options`} className="absolute left-0 top-full z-30 mt-1 min-w-32 rounded-lg border border-ink-600 bg-ink-900 p-1 shadow-xl">
        {temperatureOptions.map(({ value, Icon, menuClassName }) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={temperature === value}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[10px] font-semibold transition-colors hover:bg-ink-700 ${menuClassName} ${temperature === value ? 'bg-ink-700/70' : ''}`}
            onClick={() => {
              setOpen(false);
              if (value !== temperature) setPendingTemperature(value);
            }}
          >
            <Icon size={13} aria-hidden="true" />
            {value}
          </button>
        ))}
      </div>}
      {pendingTemperature && <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={dismissConfirmation}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmationTitleId}
          className="w-full max-w-sm rounded-xl border border-ink-600 bg-ink-900 p-4 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id={confirmationTitleId} className="text-sm font-semibold text-white">Confirm temperature change</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted" aria-label={`${leadName}: ${temperature} to ${pendingTemperature}?`}>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${selected.className}`}>
              <TemperatureIcon size={12} aria-hidden="true" />
              {temperature}
            </span>
            <ArrowRight size={14} aria-hidden="true" />
            {(() => {
              const next = temperatureOptions.find((option) => option.value === pendingTemperature);
              if (!next) return null;
              const NextIcon = next.Icon;
              return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${next.className}`}>
                <NextIcon size={12} aria-hidden="true" />
                {pendingTemperature}
              </span>;
            })()}
            <span>?</span>
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button ref={cancelRef} type="button" className="btn-ghost" onClick={dismissConfirmation}>No</button>
            <button type="button" className="btn-primary" disabled={disabled} onClick={confirmTemperatureChange}>Yes</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
