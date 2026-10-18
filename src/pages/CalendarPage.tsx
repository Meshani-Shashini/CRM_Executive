import { useState } from 'react';
import { CALENDAR_EVENTS } from '../data/seed';
import Badge from '../components/ui/Badge';
import { ChevronLeft, ChevronRight, RefreshCcw, Bell, Calendar as CalIcon, Users } from 'lucide-react';
import type { CalendarEvent } from '../types';

const typeMeta: Record<CalendarEvent['type'], { color: string; icon: typeof CalIcon }> = {
  renewal: { color: 'bg-hot', icon: RefreshCcw },
  reminder: { color: 'bg-warm', icon: Bell },
  meeting: { color: 'bg-brand-400', icon: Users },
  task: { color: 'bg-cold', icon: CalIcon },
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date(2026, 9, 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const monthName = cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const eventsByDay: Record<number, CalendarEvent[]> = {};
  CALENDAR_EVENTS.forEach((e) => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      eventsByDay[day] = eventsByDay[day] ? [...eventsByDay[day], e] : [e];
    }
  });

  const upcoming = [...CALENDAR_EVENTS].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">{monthName}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg hover:bg-ink-700 text-muted hover:text-white"><ChevronLeft size={16} /></button>
            <button onClick={() => setCursor(new Date(2026, 9, 1))} className="btn-ghost !py-1 !px-3 text-xs">Today</button>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg hover:bg-ink-700 text-muted hover:text-white"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted uppercase mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} className="aspect-square" />)}
          {Array.from({ length: daysIn }).map((_, i) => {
            const day = i + 1;
            const evts = eventsByDay[day] ?? [];
            const isToday = day === 18 && month === 9 && year === 2026;
            return (
              <div
                key={day}
                className={`aspect-square rounded-lg border p-1.5 overflow-hidden transition ${
                  isToday ? 'border-brand-400 bg-brand-500/10' : 'border-ink-700/50 bg-ink-900/40 hover:border-ink-600'
                }`}
              >
                <div className={`text-xs ${isToday ? 'text-brand-400 font-bold' : 'text-muted'}`}>{day}</div>
                <div className="space-y-0.5 mt-1">
                  {evts.slice(0, 2).map((e) => {
                    const m = typeMeta[e.type];
                    return (
                      <div key={e.id} className={`text-[9px] leading-tight ${m.color} text-white rounded px-1 py-0.5 truncate`}>
                        {e.title}
                      </div>
                    );
                  })}
                  {evts.length > 2 && <div className="text-[9px] text-muted">+{evts.length - 2} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2"><Bell size={16} /> Upcoming Events</h3>
        <div className="space-y-2">
          {upcoming.map((e) => {
            const m = typeMeta[e.type];
            const Icon = m.icon;
            return (
              <div key={e.id} className="flex items-start gap-3 bg-ink-900/40 rounded-lg p-3 border border-ink-700/60">
                <div className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center shrink-0`}>
                  <Icon size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{e.title}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {e.days > 0 && <Badge variant="warm"> {e.days}-day trigger</Badge>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
