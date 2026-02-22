import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { getAuth } from '../../google-auth';

let calendarClient: calendar_v3.Calendar | undefined;

export async function getCalendar(): Promise<calendar_v3.Calendar> {
  if (!calendarClient) {
    const auth = await getAuth();
    calendarClient = google.calendar({ version: 'v3', auth });
  }
  return calendarClient;
}
