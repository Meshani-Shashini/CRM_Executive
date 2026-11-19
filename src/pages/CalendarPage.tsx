import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { buildCalendarEvents, type CalendarEvent, type CalendarEventKind } from '../utils/calendarData';
import { dashboardHref } from '../utils/navigation';
import { formatDate } from '../utils/date';
import PageToolbar from '../components/ui/PageToolbar';
import ViewModeSwitcher from '../components/ui/ViewModeSwitcher';

type CalendarView = 'month' | 'week' | 'agenda';

const kindMeta: Record<CalendarEventKind, { label: string; color: string; dot: string }> = {
  activity: { label: 'Activity', color: 'bg-warm/15 text-warm border-warm/30', dot: 'bg-warm' },
  meeting: { label: 'Meeting', color: 'bg-brand-500/20 text-brand-300 border-brand-400/40', dot: 'bg-brand-400' },
  deal: { label: 'Deal close', color: 'bg-cold/15 text-cold border-cold/30', dot: 'bg-cold' },
  lead: { label: 'Lead close', color: 'bg-violet-500/15 text-violet-300 border-violet-400/30', dot: 'bg-violet-400' },
  renewal: { label: 'Renewal', color: 'bg-hot/15 text-hot border-hot/30', dot: 'bg-hot' },
  sla: { label: 'SLA due', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', dot: 'bg-emerald-400' },
  quotation: { label: 'Quotation validity', color: 'bg-amber-500/15 text-amber-300 border-amber-400/30', dot: 'bg-amber-400' },
};

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromDateKey(value: string) {
  return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches === true;
}

export default function CalendarPage() {
  const { activities, clients, deals, leads, clientQuotations, pipelineStages, stageHistory, user, users } = useApp();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [phone, setPhone] = useState(isPhone);
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()));

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
    clientQuotations,
  }), [activities, clientQuotations, clients, deals, leads, pipelineStages, stageHistory]);

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
  const currentEvents = events.filter((event) => event.date >= visibleStart && event.date <= visibleEnd);
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of currentEvents) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }
  const shiftCursor = (amount: number) => {
    const nextCursor = effectiveView === 'week'
      ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + amount * 7)
      : new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1);
    setCursor(nextCursor);
    setSelectedDate(localDate(nextCursor));
  };
  const periodTitle = effectiveView === 'week'
    ? `${formatDate(weekStart)} – ${formatDate(weekEnd)}`
    : monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const periodUnit = effectiveView === 'week' ? 'week' : 'month';

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
  const monthOffset = (monthStart.getDay() + 6) % 7;
  const monthWeekCount = Math.ceil((monthOffset + monthEnd.getDate()) / 7);
  const monthCells = Array.from({ length: monthWeekCount * 7 }, (_, index) => {
    const day = index - monthOffset + 1;
    return day > 0 && day <= monthEnd.getDate() ? new Date(cursorYear, cursorMonth, day) : null;
  });
  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];
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
      <PageToolbar name="calendar" className="justify-between">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label={`Previous ${periodUnit}`} onClick={() => shiftCursor(-1)} className="rounded-lg p-1.5 text-muted hover:bg-ink-700 hover:text-white">
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-36 text-sm font-semibold text-white" aria-live="polite">{periodTitle}</h2>
          <button type="button" aria-label={`Next ${periodUnit}`} onClick={() => shiftCursor(1)} className="rounded-lg p-1.5 text-muted hover:bg-ink-700 hover:text-white">
            <ChevronRight size={16} />
          </button>
        </div>
        <ViewModeSwitcher label="Calendar view" role="group" value={view} onChange={(nextView) => {
          setView(nextView);
          setSelectedDate(localDate(cursor));
        }}
          className="hidden sm:inline-flex"
          options={[
            { value: 'month', label: 'Month', Icon: CalendarDays },
            { value: 'week', label: 'Week', Icon: CalendarRange },
            { value: 'agenda', label: 'Agenda', Icon: List },
          ]} />
      </PageToolbar>

      <div data-page-content="calendar" className="calendar-layout grid min-w-0 gap-2 lg:min-h-0 lg:flex-1">
        <section className="calendar-view-panel glass min-w-0 rounded-2xl p-3 sm:p-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden" aria-label={`${effectiveView} calendar`}>
          {effectiveView === 'month' && (
            <>
              <div aria-label="Calendar weekdays" data-testid="calendar-weekdays" className="mb-1 grid shrink-0 grid-cols-7 gap-1 text-center text-[10px] text-muted sm:text-xs">
                {weekdays.map((day) => <div key={day} className="py-1">{day}</div>)}
              </div>
              <div
                data-testid="calendar-month-grid"
                data-week-count={monthWeekCount}
                className="calendar-month-grid grid min-h-[18rem] flex-1 grid-cols-7 gap-1 lg:min-h-[16rem]"
                style={{ gridTemplateRows: `repeat(${monthWeekCount}, minmax(0, 1fr))` }}
              >
                {monthCells.map((date, index) => {
                  if (!date) return <div key={`blank-${index}`} aria-hidden="true" className="min-h-16 min-w-0 overflow-hidden rounded-lg lg:min-h-0" />;
                  const key = localDate(date);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const selected = key === selectedDate;
                  const isToday = key === todayKey;
                  return (
                    <button
                      key={key}
                      data-testid="calendar-month-day"
                      data-event-count={dayEvents.length}
                      type="button"
                      aria-label={`Select ${formatDate(date)}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedDate(key)}
                      className={`flex min-h-16 min-w-0 flex-col items-center overflow-hidden rounded-lg border border-transparent p-1 transition hover:bg-ink-800/50 sm:p-1.5 lg:min-h-0 ${
                        selected ? 'bg-brand-500/10 ring-1 ring-brand-400/40' : 'bg-ink-900/20'
                      }`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] sm:text-xs ${
                        selected ? 'bg-brand-400 font-semibold text-white' : isToday ? 'font-semibold text-brand-300' : 'text-[#D0D3D9]'
                      }`}>{date.getDate()}</span>
                      <span data-testid="calendar-day-events" className="mt-1 flex min-h-2 items-center justify-center gap-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <span key={event.id} data-testid="calendar-event-dot" className={`h-1.5 w-1.5 rounded-full ${kindMeta[event.kind].dot}`} aria-hidden="true" />
                        ))}
                      </span>
                    </button>
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
                    <div className="mb-2 text-xs font-medium text-white">{weekdays[(date.getDay() + 6) % 7]} <span className="text-muted">{date.getDate()}</span></div>
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

          {effectiveView === 'month' && (
            <section data-testid="calendar-selected-events" aria-label={`Events on ${formatDate(fromDateKey(selectedDate))}`} className="mt-3 shrink-0 border-t border-ink-700/70 pt-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-white">{formatDate(fromDateKey(selectedDate))}</h2>
                <span className="text-[10px] text-muted">{selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}</span>
              </div>
              <div className="max-h-36 divide-y divide-ink-700/60 overflow-y-auto">
                {selectedDayEvents.map((event) => (
                  <button key={event.id} data-testid="calendar-selected-event" type="button" onClick={() => openEvent(event)}
                    className="flex w-full min-w-0 items-center gap-3 px-1 py-2 text-left transition hover:bg-ink-800/40">
                    <List size={14} className="shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-[#E1E2E5]">{event.title}</span>
                      {event.client && <span className="mt-0.5 block truncate text-[10px] text-muted">{event.client} · {kindMeta[event.kind].label}</span>}
                    </span>
                    <time className="shrink-0 text-[10px] text-muted">{event.time ?? 'All day'}</time>
                  </button>
                ))}
                {selectedDayEvents.length === 0 && <p className="py-3 text-center text-xs text-muted">No events on this day.</p>}
              </div>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
