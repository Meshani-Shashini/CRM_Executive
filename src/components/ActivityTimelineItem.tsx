import {
  Activity, ArrowRight, CalendarDays, Check, FileText, Flame, MessageSquare, Phone, Snowflake, Sun,
} from 'lucide-react';
import { formatDate } from '../utils/date';
import type { Activity as ActivityRecord } from '../types';

type ActivityCategory = 'stage' | 'activity' | 'appointment' | 'proposal' | 'note' | 'task' | 'temperature' | 'call' | 'email' | 'upload';

const temperatureStyles = {
  HOT: { Icon: Flame, className: 'border-hot/40 bg-hot/10 text-hot' },
  WARM: { Icon: Sun, className: 'border-amber-400/40 bg-amber-500/10 text-amber-300' },
  COLD: { Icon: Snowflake, className: 'border-blue-400/40 bg-blue-500/10 text-blue-300' },
} as const;

const categoryIcons: Record<ActivityCategory, typeof Activity> = {
  stage: ArrowRight,
  temperature: Flame,
  activity: Phone,
  call: Phone,
  email: MessageSquare,
  upload: FileText,
  appointment: CalendarDays,
  proposal: FileText,
  note: MessageSquare,
  task: Check,
};

function temperatureTransition(title: string, description: string) {
  const transitionPattern = /\b(HOT|WARM|COLD)\s*(?:→|->|to)\s*(HOT|WARM|COLD)\b/i;
  const match = /temperature changed:/i.test(title)
    ? transitionPattern.exec(title)
    : transitionPattern.exec(description);
  if (!match) return undefined;
  return {
    from: match[1].toUpperCase() as keyof typeof temperatureStyles,
    to: match[2].toUpperCase() as keyof typeof temperatureStyles,
  };
}

export default function ActivityTimelineItem({
  title,
  description,
  date,
  category,
  durationMinutes,
  origin,
  actor,
  onMarkDone,
}: {
  title: string;
  description?: string;
  date: string;
  category: ActivityCategory | ActivityRecord['type'];
  durationMinutes?: number;
  origin?: 'Lead' | 'Deal' | 'Quotation';
  actor?: string;
  onMarkDone?: () => void;
}) {
  const transition = temperatureTransition(title, description ?? '');
  const CategoryIcon = categoryIcons[transition ? 'temperature' : category === 'meeting' ? 'appointment'
    : category === 'quote' ? 'proposal'
      : category === 'task' ? 'task'
        : category === 'note' ? 'note'
          : category === 'stage' ? 'stage' : 'activity'];
  const details = [
    description && !transition ? description : '',
    durationMinutes !== undefined ? `${durationMinutes} min` : '',
  ].filter(Boolean).join(' · ');
  const timestamp = new Date(date);
  const formattedDate = Number.isFinite(timestamp.getTime())
    ? `${formatDate(timestamp)} ${timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
    : '';

  return (
    <article className="grid w-full min-w-0 grid-cols-[max-content_14px_minmax(0,1fr)] items-center gap-1.5 border-b border-ink-700/70 px-1.5 py-1 last:border-b-0">
      <time className="whitespace-nowrap font-mono text-[9px] tabular-nums text-[#8B949E]">{formattedDate}</time>
      <CategoryIcon size={12} className="text-muted" aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[10px] leading-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {transition ? (
              <div className="flex shrink-0 items-center gap-1" aria-label={`Lead temperature: ${transition.from} to ${transition.to}`}>
                <TemperatureTag value={transition.from} />
                <ArrowRight size={10} className="text-muted" aria-hidden="true" />
                <TemperatureTag value={transition.to} />
              </div>
            ) : (
              <span className="truncate font-medium text-white" title={title}>{title}</span>
            )}
            {origin && <span className="shrink-0 rounded-full border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[8px] font-semibold text-brand-200">{origin}</span>}
            {actor && <span className="truncate text-[9px] text-muted" title={actor}>By {actor}</span>}
            {onMarkDone && <button type="button" className="shrink-0 rounded border border-ink-600 px-1.5 text-[9px] text-muted hover:text-white" onClick={onMarkDone}>Mark done</button>}
          </div>
          {details && <div className="truncate text-muted" title={details}>{details}</div>}
        </div>
      </div>
    </article>
  );
}

function TemperatureTag({ value }: { value: keyof typeof temperatureStyles }) {
  const { Icon, className } = temperatureStyles[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${className}`}>
      <Icon size={10} aria-hidden="true" />
      {value}
    </span>
  );
}
