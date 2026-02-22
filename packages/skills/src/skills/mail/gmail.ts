import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { getAuth } from '../../google-auth';

let gmailClient: gmail_v1.Gmail | undefined;

export async function getGmail(): Promise<gmail_v1.Gmail> {
  if (!gmailClient) {
    const auth = await getAuth();
    gmailClient = google.gmail({ version: 'v1', auth });
  }
  return gmailClient;
}
