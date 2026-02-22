import { getCalendar } from './google-calendar';
import type { CalendarSummary } from './index';

export async function listCalendars(): Promise<CalendarSummary[]> {
  const calendar = await getCalendar();
  const res = await calendar.calendarList.list();
  const items = res.data.items ?? [];

  return items.map((cal) => ({
    id: cal.id ?? '',
    summary: cal.summary ?? '',
    primary: cal.primary ?? false,
  }));
}
