import { getCalendar } from './google-calendar';
import type { FreeBusyParams, FreeBusyResponse, FreeBusySlot } from './index';

export async function getFreeBusy(params: FreeBusyParams): Promise<FreeBusyResponse> {
  const calendar = await getCalendar();
  const calendarIds = params.calendarIds ?? ['primary'];

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const calendars: Record<string, { busy: FreeBusySlot[] }> = {};

  for (const [calId, data] of Object.entries(res.data.calendars ?? {})) {
    calendars[calId] = {
      busy: (data.busy ?? []).map((slot) => ({
        start: slot.start ?? '',
        end: slot.end ?? '',
      })),
    };
  }

  return { calendars };
}
