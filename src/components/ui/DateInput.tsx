import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateInput, normalizeDateInput, parseDateInput } from '../../utils/date';

interface DateInputProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  onIsoChange?: (value: string) => void;
}

/** Browser-independent date field with a strict DD-MMM-YYYY display format. */
export default function DateInput({
  name, value, defaultValue = '', required, className = 'input', id, onIsoChange, ...ariaProps
}: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const localIsoChangeRef = useRef<string | null>(null);
  const [displayValue, setDisplayValue] = useState(() => formatDateInput(normalizeDateInput(value ?? defaultValue)));
  const [isoValue, setIsoValue] = useState(() => normalizeDateInput(value ?? defaultValue));

  useEffect(() => {
    if (value === undefined) return;
    const normalizedValue = normalizeDateInput(value);
    if (localIsoChangeRef.current === normalizedValue) {
      localIsoChangeRef.current = null;
      return;
    }
    setIsoValue(normalizedValue);
    setDisplayValue(formatDateInput(normalizedValue));
  }, [value]);

  const updateValue = (nextDisplayValue: string) => {
    setDisplayValue(nextDisplayValue);
    const nextIsoValue = parseDateInput(nextDisplayValue);
    localIsoChangeRef.current = nextIsoValue;
    setIsoValue(nextIsoValue);
    onIsoChange?.(nextIsoValue);
  };

  const normalize = () => {
    const nextIsoValue = parseDateInput(displayValue);
    if (nextIsoValue) setDisplayValue(formatDateInput(nextIsoValue));
  };

  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) return;
    if (picker.showPicker) picker.showPicker();
    else picker.click();
  };

  const selectDate = (nextIsoValue: string) => {
    const normalizedValue = normalizeDateInput(nextIsoValue);
    localIsoChangeRef.current = normalizedValue;
    setIsoValue(normalizedValue);
    setDisplayValue(formatDateInput(normalizedValue));
    onIsoChange?.(normalizedValue);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        className={`${className} pr-10`}
        value={displayValue}
        onChange={(event) => updateValue(event.target.value)}
        onClick={openPicker}
        onBlur={normalize}
        placeholder="DD-MMM-YYYY"
        inputMode="numeric"
        maxLength={11}
        required={required}
        aria-label={ariaProps['aria-label']}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-white"
        onClick={openPicker}
        aria-label={`Open ${ariaProps['aria-label'] ?? 'date'} calendar`}
      >
        <Calendar size={16} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="pointer-events-none absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 opacity-0"
        value={isoValue}
        onChange={(event) => selectDate(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
      {name && <input type="hidden" name={name} value={isoValue} />}
    </div>
  );
}
