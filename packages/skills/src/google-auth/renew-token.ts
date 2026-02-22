#!/usr/bin/env bun
/**
 * Renew Google OAuth token by removing the existing token and re-authorizing.
 * Starts a local server to capture the OAuth callback automatically.
 * Run with: bun run google:renew-token
 */
import { google } from 'googleapis';
import { access, readFile, writeFile, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPES: string[] = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts',
];

const CALLBACK_PORT = 3000;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}`;

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

async function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: CALLBACK_PORT,
      fetch(req) {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        // Schedule server shutdown
        setTimeout(() => server.stop(), 100);

        if (error) {
          reject(new Error(`OAuth error: ${error}`));
          return new Response(
            `<html><body><h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        }

        if (code) {
          resolve(code);
          return new Response(
            `<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        }

        return new Response(
          `<html><body><h1>Waiting for authentication...</h1></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      },
    });

    console.log(`Callback server listening on ${REDIRECT_URI}`);
  });
}

async function renewToken(): Promise<void> {
  console.log('Google OAuth Token Renewal\n');

  if (!(await fileExists(CREDENTIALS_PATH))) {
    console.error(
      `Missing ${CREDENTIALS_PATH}. Download your OAuth client credentials from Google Cloud Console.`
    );
    process.exit(1);
  }

  // Remove existing token to force re-authorization
  if (await fileExists(TOKEN_PATH)) {
    console.log('Removing existing token...');
    await unlink(TOKEN_PATH);
  }

  const raw = await readFile(CREDENTIALS_PATH, 'utf-8');
  const credentials: OAuthCredentials = JSON.parse(raw);
  const cfg = credentials.installed || credentials.web;

  if (!cfg) {
    console.error(
      `${CREDENTIALS_PATH} must contain an "installed" or "web" object with client_id, client_secret and redirect_uris.`
    );
    process.exit(1);
  }

  const { client_id, client_secret } = cfg;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: REDIRECT_URI,
  });

  // Try to open browser
  Bun.spawn(['xdg-open', authUrl], { stderr: 'ignore', stdout: 'ignore' });

  console.log('Visit this URL to authenticate:\n');
  console.log(authUrl);
  console.log();

  try {
    const code = await waitForCallback();
    console.log('\nReceived authorization code, exchanging for token...');

    const { tokens } = await oauth2Client.getToken(code);
    await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Token renewed successfully and saved to token.json');
  } catch (err) {
    console.error('\nFailed to get token:', err);
    process.exit(1);
  }
}

renewToken();
