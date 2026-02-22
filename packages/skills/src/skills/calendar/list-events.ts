import { getCalendar } from './google-calendar';
import type { CalendarEvent, ListEventsParams } from './index';

export async function listEvents(params?: ListEventsParams): Promise<CalendarEvent[]> {
  const calendar = await getCalendar();
  const res = await calendar.events.list({
    calendarId: params?.calendarId ?? 'primary',
    maxResults: params?.maxResults ?? 10,
    timeMin: params?.timeMin ?? new Date().toISOString(),
    timeMax: params?.timeMax,
    q: params?.q,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = res.data.items ?? [];

  return items.map((event) => ({
    id: event.id ?? '',
    summary: event.summary ?? '',
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: {
      dateTime: event.start?.dateTime ?? undefined,
      date: event.start?.date ?? undefined,
    },
    end: {
      dateTime: event.end?.dateTime ?? undefined,
      date: event.end?.date ?? undefined,
    },
    attendees: event.attendees?.map((a) => ({
      email: a.email ?? '',
      responseStatus: a.responseStatus ?? undefined,
    })),
    status: (event.status as 'confirmed' | 'tentative' | 'cancelled') ?? 'confirmed',
    htmlLink: event.htmlLink ?? undefined,
  }));
}
