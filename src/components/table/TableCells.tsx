import { normalizeDateInput } from '../../utils/date';
import { avatarCode } from './avatar';

export function ProductCodePill({ code, name }: { code?: string; name?: string }) {
  const normalizedCode = (code ?? '').slice(0, 2).toUpperCase();
  const colors = normalizedCode === 'CF' || normalizedCode === 'FY'
    ? { backgroundColor: '#261414', color: '#D84C4C' }
    : normalizedCode === 'SH'
      ? { backgroundColor: '#0E2336', color: '#389FD6' }
      : normalizedCode === 'TL'
        ? { backgroundColor: '#10261A', color: '#3AA76D' }
        : { backgroundColor: '#1A1D21', color: '#8E95A2' };
  return <span className="pill border border-transparent !px-1.5 !py-0.5" style={colors} title={name || code}>{normalizedCode}</span>;
}

export function OwnerCell({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={name}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#292B30] text-[9px] font-semibold text-[#A4A6AE]">{avatarCode(name)}</span>
      <span className="owner-name truncate text-[10px] text-[#E1E2E5]">{name}</span>
    </span>
  );
}

export function TableDateCell({ value }: { value?: string }) {
  const date = value ? normalizeDateInput(value) : '';
  return <span className="block truncate" title={date}>{date}</span>;
}

export function StagePill({
  stage,
  outcome,
  uppercase = false,
  truncate = false,
  title,
}: {
  stage: string;
  outcome: 'won' | 'lost' | 'neutral';
  uppercase?: boolean;
  truncate?: boolean;
  title?: string;
}) {
  const tone = outcome === 'lost'
    ? 'border-[#4A2020] bg-[#2E1111] text-[#E54848]'
    : outcome === 'won'
      ? 'border-[#1B5137] bg-[#0D2B1D] text-[#27C272]'
      : 'border-[#2A2E35] bg-[#17191C] text-[#E1E2E5]';
  const label = uppercase && stage === 'Converted to deal' ? 'CONVERTED' : stage;
  return (
    <span className={`pill inline-flex ${truncate ? 'min-w-0 flex-1 overflow-hidden text-ellipsis' : 'w-fit max-w-full shrink-0'} whitespace-nowrap border !px-2 !py-0.5 text-[10px] leading-none ${uppercase ? 'uppercase' : 'normal-case tracking-normal'} ${tone}`} title={title ?? stage}>
      {truncate ? <span className="block min-w-0 truncate">{label}</span> : label}
    </span>
  );
}
