import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

// Combined scopes for all Google skills
const SCOPES: string[] = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, 'token.json');
const CREDENTIALS_PATH = resolve(__dirname, 'client_secret.json');

type OAuthConfig = {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
};

type OAuthCredentials = {
  installed?: OAuthConfig;
  web?: OAuthConfig;
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function authorize(): Promise<Auth.OAuth2Client> {
  if (!(await fileExists(CREDENTIALS_PATH))) {
    throw new Error(
      `Missing ${CREDENTIALS_PATH}. Download your OAuth client credentials from Google Cloud Console.`
    );
  }

  const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
  const credentials: OAuthCredentials = JSON.parse(raw);
  const cfg = credentials.installed || credentials.web;

  if (!cfg) {
    throw new Error(
      `${CREDENTIALS_PATH} must contain an "installed" or "web" object with client_id, client_secret and redirect_uris.`
    );
  }

  const { client_id, client_secret, redirect_uris = [] } = cfg;
  const redirectUri = redirect_uris[0];
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  if (await fileExists(TOKEN_PATH)) {
    const token = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting:', authUrl);

  const rl = readline.createInterface({ input, output });
  const code = await new Promise<string>((resolve) => {
    rl.question('Enter the code from that page here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  return oauth2Client;
}

let authClient: Auth.OAuth2Client | undefined;

export async function getAuth(): Promise<Auth.OAuth2Client> {
  if (!authClient) {
    authClient = await authorize();
  }
  return authClient;
}
