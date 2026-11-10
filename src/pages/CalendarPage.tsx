import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { buildCalendarEvents, type CalendarEvent, type CalendarEventKind } from '../utils/calendarData';
import { dashboardHref } from '../utils/navigation';
import { formatDate } from '../utils/date';

type CalendarView = 'month' | 'week' | 'agenda';

const kindMeta: Record<CalendarEventKind, { label: string; color: string; dot: string }> = {
  activity: { label: 'Activity', color: 'bg-warm/15 text-warm border-warm/30', dot: 'bg-warm' },
  meeting: { label: 'Meeting', color: 'bg-brand-500/20 text-brand-300 border-brand-400/40', dot: 'bg-brand-400' },
  deal: { label: 'Deal close', color: 'bg-cold/15 text-cold border-cold/30', dot: 'bg-cold' },
  lead: { label: 'Lead close', color: 'bg-violet-500/15 text-violet-300 border-violet-400/30', dot: 'bg-violet-400' },
  renewal: { label: 'Renewal', color: 'bg-hot/15 text-hot border-hot/30', dot: 'bg-hot' },
  sla: { label: 'SLA due', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', dot: 'bg-emerald-400' },
};

const categories = [
  ['activity', 'Activities'],
  ['deal', 'Deal closes'],
  ['lead', 'Lead closes'],
  ['renewal', 'Renewals'],
  ['sla', 'SLA due'],
] as const;

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromDateKey(value: string) {
  return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches === true;
}

export default function CalendarPage() {
  const { activities, clients, deals, leads, pipelines, pipelineStages, stageHistory, user, users } = useApp();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [phone, setPhone] = useState(isPhone);
  const [ownership, setOwnership] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState('all');
  const [pipelineId, setPipelineId] = useState('all');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const events = useMemo(() => buildCalendarEvents({
    activities,
    clients,
    deals,
    leads,
    pipelineStages,
    stageHistory,
  }), [activities, clients, deals, leads, pipelineStages, stageHistory]);

  const filteredEvents = events.filter((event) =>
    (ownership === 'all' || event.ownerId === user.id)
    && (category === 'all' || event.category === category)
    && (pipelineId === 'all' || event.pipelineId === pipelineId));
  const effectiveView = phone ? 'agenda' : view;
  const todayKey = localDate(new Date());
  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();
  const monthStart = new Date(cursorYear, cursorMonth, 1);
  const monthEnd = new Date(cursorYear, cursorMonth + 1, 0);
  const weekStart = startOfWeek(cursor);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const visibleStart = effectiveView === 'week' ? localDate(weekStart) : localDate(monthStart);
  const visibleEnd = effectiveView === 'week' ? localDate(weekEnd) : localDate(monthEnd);
  const currentEvents = filteredEvents.filter((event) => event.date >= visibleStart && event.date <= visibleEnd);
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of currentEvents) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }
  const upcoming = filteredEvents.filter((event) => event.date >= todayKey).slice(0, 8);

  const shiftCursor = (amount: number) => {
    setCursor((current) => effectiveView === 'month'
      ? new Date(current.getFullYear(), current.getMonth() + amount, 1)
      : new Date(current.getFullYear(), current.getMonth(), current.getDate() + amount * 7));
  };
  const goToday = () => setCursor(new Date());
  const periodTitle = effectiveView === 'week'
    ? `${formatDate(weekStart)} – ${formatDate(weekEnd)}`
    : formatDate(monthStart).replace(/^\d{2}-/, '').replace(/-\d{4}$/, ` ${cursorYear}`);

  const eventButton = (event: CalendarEvent, compact = false) => {
    const meta = kindMeta[event.kind];
    return (
      <button
        key={event.id}
        type="button"
        title={`${event.title} · ${event.client}`}
        onClick={() => openEvent(event)}
        className={`block w-full min-w-0 truncate whitespace-nowrap rounded border text-left transition hover:brightness-125 ${meta.color} ${
          compact ? 'px-1 py-0.5 text-[9px] leading-tight' : 'px-2.5 py-2 text-xs'
        }`}
      >
        {event.title}
      </button>
    );
  };

  const periodDays = effectiveView === 'week'
    ? Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return date;
    })
    : [];
  const monthWeekCount = Math.ceil((monthStart.getDay() + monthEnd.getDate()) / 7);
  const monthCells = Array.from({ length: monthWeekCount * 7 }, (_, index) => {
    const day = index - monthStart.getDay() + 1;
    return day > 0 && day <= monthEnd.getDate() ? new Date(cursorYear, cursorMonth, day) : null;
  });
  const agendaDates = [...eventsByDate.keys()].sort();
  const userName = (id: string) => users.find((item) => item.id === id)?.name ?? (id === user.id ? user.name : '');
  const openEvent = (event: CalendarEvent) => {
    window.location.hash = dashboardHref(event.target.route, {
      id: event.target.id,
      ...(event.target.route === 'deals' ? { view: 'inspection' } : {}),
    });
  };

  return (
    <div className="calendar-page flex min-w-0 flex-col gap-2 lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      <div data-page-toolbar="calendar" className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="hidden items-center gap-1 rounded-lg border border-ink-700 bg-ink-900/70 p-1 sm:inline-flex" role="group" aria-label="Calendar view">
          {(['month', 'week', 'agenda'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}
              className={`rounded-md px-3 py-1.5 text-xs capitalize ${view === option ? 'bg-brand-500 text-white' : 'text-muted hover:text-white'}`}>
              {option}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="calendar-ownership">Show</label>
        <select id="calendar-ownership" aria-label="Show calendar events" className="input !w-auto !py-1.5 !text-xs" value={ownership} onChange={(event) => setOwnership(event.target.value as 'all' | 'mine')}>
            <option value="all">All events</option>
            <option value="mine">Mine</option>
        </select>
        <label className="sr-only" htmlFor="calendar-category">Type</label>
        <select id="calendar-category" aria-label="Filter calendar by type" className="input !w-auto !py-1.5 !text-xs" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All types</option>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="sr-only" htmlFor="calendar-pipeline">Pipeline</label>
        <select id="calendar-pipeline" aria-label="Filter calendar by pipeline" className="input !w-auto max-w-48 !py-1.5 !text-xs" value={pipelineId} onChange={(event) => setPipelineId(event.target.value)}>
            <option value="all">All pipelines</option>
            {pipelines.filter((pipeline) => pipeline.isActive).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
        <span className="min-w-24 text-center text-xs font-medium text-white" aria-live="polite">{periodTitle}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Previous period" onClick={() => shiftCursor(-1)} className="rounded-lg p-2 text-muted hover:bg-ink-700 hover:text-white"><ChevronLeft size={16} /></button>
          <button type="button" onClick={goToday} className="btn-ghost !px-2.5 !py-1.5 text-[11px]">Today</button>
          <button type="button" aria-label="Next period" onClick={() => shiftCursor(1)} className="rounded-lg p-2 text-muted hover:bg-ink-700 hover:text-white"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div data-page-content="calendar" className="calendar-layout grid min-w-0 gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)]">
        <section className="calendar-view-panel glass min-w-0 rounded-2xl p-3 sm:p-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden" aria-label={`${effectiveView} calendar`}>
          {effectiveView === 'month' && (
            <>
              <div className="mb-1 grid shrink-0 grid-cols-7 gap-1 text-center text-[10px] text-muted sm:text-xs">
                {weekdays.map((day) => <div key={day} className="py-1">{day}</div>)}
              </div>
              <div
                data-testid="calendar-month-grid"
                data-week-count={monthWeekCount}
                className="calendar-month-grid grid min-h-0 flex-1 grid-cols-7 gap-1"
                style={{ gridTemplateRows: `repeat(${monthWeekCount}, minmax(0, 1fr))` }}
              >
                {monthCells.map((date, index) => {
                  if (!date) return <div key={`blank-${index}`} className="min-h-16 min-w-0 overflow-hidden rounded-lg bg-ink-900/20 lg:min-h-0" />;
                  const key = localDate(date);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      data-testid="calendar-month-day"
                      data-event-count={dayEvents.length}
                      className={`flex min-h-16 min-w-0 flex-col overflow-hidden rounded-lg border p-1 sm:p-1.5 lg:min-h-0 ${
                        key === todayKey ? 'border-brand-400 bg-brand-500/10' : 'border-ink-700/50 bg-ink-900/40'
                      }`}
                    >
                      <div className={`mb-0.5 shrink-0 text-[10px] sm:text-xs ${key === todayKey ? 'font-bold text-brand-300' : 'text-muted'}`}>{date.getDate()}</div>
                      <div data-testid="calendar-day-events" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                        {dayEvents.map((event) => eventButton(event, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {effectiveView === 'week' && (
            <div className="min-h-0 min-w-0 overflow-y-auto lg:flex-1">
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {periodDays.map((date) => {
                const key = localDate(date);
                const dayEvents = eventsByDate.get(key) ?? [];
                return (
                  <div key={key} className={`min-w-0 rounded-lg border p-2 ${key === todayKey ? 'border-brand-400 bg-brand-500/10' : 'border-ink-700/50 bg-ink-900/40'}`}>
                    <div className="mb-2 text-xs font-medium text-white">{weekdays[date.getDay()]} <span className="text-muted">{date.getDate()}</span></div>
                    <div className="space-y-1.5">{dayEvents.map((event) => eventButton(event))}</div>
                    {dayEvents.length === 0 && <p className="text-[10px] text-muted">No events</p>}
                  </div>
                );
              })}
            </div>
            </div>
          )}

          {effectiveView === 'agenda' && (
            <div className="min-h-0 space-y-3 overflow-y-auto lg:flex-1">
              {agendaDates.length === 0 && <p className="rounded-lg border border-ink-700/60 p-4 text-sm text-muted">No events in this period.</p>}
              {agendaDates.map((date) => (
                <section key={date} className="min-w-0 rounded-lg border border-ink-700/60 bg-ink-900/30 p-3">
                  <h3 className="mb-2 text-xs font-semibold text-white">{formatDate(fromDateKey(date))}</h3>
                  <div className="space-y-2">{(eventsByDate.get(date) ?? []).map((event) => (
                    <div key={event.id} className="flex min-w-0 items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindMeta[event.kind].dot}`} />
                      <div className="min-w-0 flex-1">
                        {eventButton(event)}
                        <div className="mt-1 truncate text-[10px] text-muted">{event.client}{userName(event.ownerId) ? ` · ${userName(event.ownerId)}` : ''}</div>
                      </div>
                    </div>
                  ))}</div>
                </section>
              ))}
            </div>
          )}
        </section>

        <aside className="glass flex min-w-0 flex-col rounded-2xl p-4 sm:p-5 lg:min-h-0 lg:overflow-hidden">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Bell size={15} /> Upcoming</h2>
          <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {upcoming.length === 0 && <p className="text-sm text-muted">No upcoming events.</p>}
            {upcoming.map((event) => (
              <button key={event.id} type="button" onClick={() => openEvent(event)}
                className="flex w-full min-w-0 items-start gap-2.5 rounded-lg border border-ink-700/60 bg-ink-900/40 p-2.5 text-left transition hover:border-ink-500">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kindMeta[event.kind].dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-white">{event.title}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><Clock3 size={11} />{formatDate(fromDateKey(event.date))} · {kindMeta[event.kind].label}</div>
                </div>
                <CalendarDays size={13} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
