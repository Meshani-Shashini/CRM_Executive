import type { KeyboardEventHandler } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ViewModeOption<T extends string> {
  value: T;
  label: string;
  Icon?: LucideIcon;
  showLabel?: boolean;
}

interface ViewModeSwitcherProps<T extends string> {
  label: string;
  value: T;
  options: readonly ViewModeOption<T>[];
  onChange: (value: T) => void;
  role?: 'tablist' | 'group';
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export default function ViewModeSwitcher<T extends string>({
  label,
  value,
  options,
  onChange,
  role = 'tablist',
  className = '',
  onKeyDown,
}: ViewModeSwitcherProps<T>) {
  return (
    <div
      role={role}
      aria-label={label}
      className={`inline-flex items-center gap-1 rounded-lg border border-[#1B1E22] bg-[#0B0C0E] p-0.5 ${className}`}
      onKeyDown={onKeyDown}
    >
      {options.map(({ value: optionValue, label: optionLabel, Icon, showLabel = false }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            role={role === 'tablist' ? 'tab' : undefined}
            data-view-option={optionValue}
            aria-label={optionLabel}
            title={optionLabel}
            aria-selected={role === 'tablist' ? selected : undefined}
            aria-pressed={role === 'group' ? selected : undefined}
            onClick={() => onChange(optionValue)}
            className={`rounded-md p-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${selected ? 'bg-[#1B1E22] text-white' : 'text-muted hover:text-white'}`}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {Icon && !showLabel ? <span className="sr-only">{optionLabel}</span> : optionLabel}
          </button>
        );
      })}
    </div>
  );
}