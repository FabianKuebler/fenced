import { getCalendar } from './google-calendar';
import type { CalendarEvent, CreateEventParams } from './index';

const DEFAULT_TIMEZONE = 'Europe/Berlin';

export async function updateEvent(
  eventId: string,
  updates: Partial<CreateEventParams>,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const calendar = await getCalendar();
  const res = await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: updates.sendUpdates ?? 'all',
    requestBody: {
      summary: updates.summary,
      description: updates.description,
      location: updates.location,
      start: updates.start
        ? { ...updates.start, timeZone: updates.start.timeZone ?? DEFAULT_TIMEZONE }
        : undefined,
      end: updates.end
        ? { ...updates.end, timeZone: updates.end.timeZone ?? DEFAULT_TIMEZONE }
        : undefined,
      attendees: updates.attendees?.map((a) => ({ email: a.email })),
    },
  });

  const updated = res.data;

  return {
    id: updated.id ?? '',
    summary: updated.summary ?? '',
    description: updated.description ?? undefined,
    location: updated.location ?? undefined,
    start: {
      dateTime: updated.start?.dateTime ?? undefined,
      date: updated.start?.date ?? undefined,
    },
    end: {
      dateTime: updated.end?.dateTime ?? undefined,
      date: updated.end?.date ?? undefined,
    },
    attendees: updated.attendees?.map((a) => ({
      email: a.email ?? '',
      responseStatus: a.responseStatus ?? undefined,
    })),
    status: (updated.status as 'confirmed' | 'tentative' | 'cancelled') ?? 'confirmed',
    htmlLink: updated.htmlLink ?? undefined,
  };
}
