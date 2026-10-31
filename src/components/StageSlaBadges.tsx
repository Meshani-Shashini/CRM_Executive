import { Clock3, Target } from 'lucide-react';

export default function StageSlaBadges({
  elapsedDays,
  targetDays,
}: {
  elapsedDays: number;
  targetDays: number;
}) {
  const remainingDays = Math.max(0, targetDays - elapsedDays);
  const badgeClass = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#1B1E22] bg-[#0B0C0E] px-1.5 text-[10px] font-medium leading-none text-[#D0D3D9]';

  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-label="Stage timing">
      <span className={badgeClass} title={`${elapsedDays} days elapsed in the current stage`}>
        <Clock3 size={11} aria-hidden="true" />
        {elapsedDays}d
      </span>
      {targetDays > 0 && <span
        className={`${badgeClass} ${remainingDays === 0 ? 'text-amber-300' : ''}`}
        title={`${remainingDays} days remaining of ${targetDays}-day SLA target`}
      >
        <Target size={11} aria-hidden="true" />
        {remainingDays}d
      </span>}
    </span>
  );
}
