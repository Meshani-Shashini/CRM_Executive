import type { Activity } from '../types';

export type NextActivityState = 'overdue' | 'today' | 'future' | 'none';

export interface NextActivity {
  activity?: Activity;
  date?: string;
  title?: string;
  state: NextActivityState;
}

interface ActivityRecordIds {
  leadId?: string;
  dealId?: string;
}

function dueDateForActivity(activity: Activity) {
  if (activity.dueDate) return activity.dueDate;
  if (activity.type === 'task' || activity.type === 'meeting') return activity.date;
  return undefined;
}

function localDay(value: string | number) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextActivityState(dueDate: string | undefined, now = Date.now()): NextActivityState {
  if (!dueDate || !Number.isFinite(Date.parse(dueDate))) return 'none';
  const dueDay = localDay(dueDate);
  const today = localDay(now);
  if (!dueDay || !today) return 'none';
  return dueDay < today ? 'overdue' : dueDay === today ? 'today' : 'future';
}

export function getNextActivity(
  activities: Activity[],
  ids: ActivityRecordIds,
  now = Date.now(),
): NextActivity {
  const scheduled: Array<{ activity?: Activity; date: string; title: string }> = activities
    .filter((activity) => !activity.done
      && ((Boolean(ids.dealId) && activity.dealId === ids.dealId)
        || (Boolean(ids.leadId) && activity.leadId === ids.leadId)))
    .map((activity) => ({ activity, date: dueDateForActivity(activity), title: activity.title }))
    .filter((candidate): candidate is { activity: Activity; date: string; title: string } =>
      Boolean(candidate.date && Number.isFinite(Date.parse(candidate.date))));
  scheduled.sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const next = scheduled[0];
  if (next) return {
    ...next,
    state: nextActivityState(next.date, now),
  };
  return { state: 'none' };
}