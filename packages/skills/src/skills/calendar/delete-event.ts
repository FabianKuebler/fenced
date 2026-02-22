import { getCalendar } from './google-calendar';

export async function deleteEvent(
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const calendar = await getCalendar();
  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'all',
  });
}
