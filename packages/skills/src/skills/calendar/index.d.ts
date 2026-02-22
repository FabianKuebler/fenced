type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string }[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
};

type CalendarSummary = {
  id: string;
  summary: string;
  primary?: boolean;
};

type FreeBusySlot = {
  start: string;
  end: string;
};

type ListEventsParams = {
  calendarId?: string;
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
  q?: string;
};

type CreateEventParams = {
  summary: string;
  /** Defaults to Europe/Berlin if not specified */
  start: { dateTime?: string; date?: string; timeZone?: string };
  /** Defaults to Europe/Berlin if not specified */
  end: { dateTime?: string; date?: string; timeZone?: string };
  description?: string;
  location?: string;
  attendees?: { email: string }[];
  sendUpdates?: 'all' | 'externalOnly' | 'none';
};

type FreeBusyParams = {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
};

type FreeBusyResponse = {
  calendars: Record<string, { busy: FreeBusySlot[] }>;
};

declare function listCalendars(): Promise<CalendarSummary[]>;

declare function listEvents(params?: ListEventsParams): Promise<CalendarEvent[]>;

declare function createEvent(event: CreateEventParams, calendarId?: string): Promise<CalendarEvent>;

declare function updateEvent(
  eventId: string,
  updates: Partial<CreateEventParams>,
  calendarId?: string
): Promise<CalendarEvent>;

declare function getFreeBusy(params: FreeBusyParams): Promise<FreeBusyResponse>;
