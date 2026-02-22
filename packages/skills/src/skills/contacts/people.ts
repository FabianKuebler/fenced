import { google } from 'googleapis';
import type { people_v1 } from 'googleapis';
import { getAuth } from '../../google-auth';

let peopleClient: people_v1.People | undefined;

export async function getPeople(): Promise<people_v1.People> {
  if (!peopleClient) {
    const auth = await getAuth();
    peopleClient = google.people({ version: 'v1', auth });
  }
  return peopleClient;
}
