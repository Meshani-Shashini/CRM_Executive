import { Clock3, Target } from 'lucide-react';

export default function StageSlaBadges({
  elapsedDays,
  targetDays,
}: {
  elapsedDays: number | null;
  targetDays: number;
}) {
  const remainingDays = elapsedDays === null ? null : targetDays - elapsedDays;
  const overdueDays = remainingDays !== null && remainingDays < 0 ? Math.abs(remainingDays) : 0;
  const badgeClass = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#1B1E22] bg-[#0B0C0E] px-1.5 text-[10px] font-medium leading-none text-[#D0D3D9]';

  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-label="Stage timing">
      {elapsedDays !== null && <span className={badgeClass} title={`${elapsedDays} days elapsed in the current stage`}>
        <Clock3 size={11} aria-hidden="true" />
        {elapsedDays}d
      </span>}
      {targetDays > 0 && remainingDays !== null && <span
        className={`${badgeClass} ${overdueDays > 0 ? 'border-hot/40 bg-hot/10 text-hot' : remainingDays === 0 ? 'text-amber-300' : ''}`}
        title={overdueDays > 0
          ? `${overdueDays} days overdue against the ${targetDays}-day SLA target`
          : `${remainingDays} days remaining of ${targetDays}-day SLA target`}
      >
        <Target size={11} aria-hidden="true" />
        {overdueDays > 0 ? `${overdueDays}d overdue` : `${remainingDays}d left`}
      </span>}
    </span>
  );
}
