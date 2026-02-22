#!/usr/bin/env bun
/**
 * Test Google OAuth token by listing Gmail messages.
 */
import { google } from 'googleapis';
import { getAuth } from './index.ts';

async function test() {
  console.log('Testing Google Auth...\n');

  try {
    const auth = await getAuth();
    const gmail = google.gmail({ version: 'v1', auth });

    console.log('Fetching messages...');
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
    });

    const messages = res.data.messages || [];
    console.log(`Found ${messages.length} messages:\n`);
    console.log('\nAuth working!');
  } catch (err) {
    console.error('Auth failed:', err);
    process.exit(1);
  }
}

test();
