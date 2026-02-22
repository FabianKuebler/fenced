import { getCalendar } from './google-calendar';
import type { CalendarEvent } from './index';

export async function getEvent(
  eventId: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent | null> {
  try {
    const calendar = await getCalendar();
    const res = await calendar.events.get({
      calendarId,
      eventId,
    });

    const event = res.data;

    return {
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
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 404) {
      return null;
    }
    throw err;
  }
}
