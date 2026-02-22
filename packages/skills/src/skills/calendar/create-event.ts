import { getCalendar } from './google-calendar';
import type { CalendarEvent, CreateEventParams } from './index';

const DEFAULT_TIMEZONE = 'Europe/Berlin';

export async function createEvent(
  event: CreateEventParams,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const calendar = await getCalendar();
  const res = await calendar.events.insert({
    calendarId,
    sendUpdates: event.sendUpdates ?? 'all',
    requestBody: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        ...event.start,
        timeZone: event.start.timeZone ?? DEFAULT_TIMEZONE,
      },
      end: {
        ...event.end,
        timeZone: event.end.timeZone ?? DEFAULT_TIMEZONE,
      },
      attendees: event.attendees?.map((a) => ({ email: a.email })),
    },
  });

  const created = res.data;

  return {
    id: created.id ?? '',
    summary: created.summary ?? '',
    description: created.description ?? undefined,
    location: created.location ?? undefined,
    start: {
      dateTime: created.start?.dateTime ?? undefined,
      date: created.start?.date ?? undefined,
    },
    end: {
      dateTime: created.end?.dateTime ?? undefined,
      date: created.end?.date ?? undefined,
    },
    attendees: created.attendees?.map((a) => ({
      email: a.email ?? '',
      responseStatus: a.responseStatus ?? undefined,
    })),
    status: (created.status as 'confirmed' | 'tentative' | 'cancelled') ?? 'confirmed',
    htmlLink: created.htmlLink ?? undefined,
  };
}
