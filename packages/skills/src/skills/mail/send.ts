import { getGmail } from './gmail';
import type { SendMailParams, SendResult, ReplyParams, ForwardParams } from './types';
import { createMimeMessage, toArray, getHeader } from './helpers';

export async function sendMail(params: SendMailParams): Promise<SendResult> {
  const gmail = await getGmail();
  const to = toArray(params.to);

  let threadId: string | undefined;
  let inReplyTo: string | undefined;
  let references: string | undefined;

  // If replying to a message, get threading headers
  if (params.replyToMessageId) {
    const original = await gmail.users.messages.get({
      userId: 'me',
      id: params.replyToMessageId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
    });

    const headers = original.data.payload?.headers ?? [];
    const messageId = getHeader(headers, 'Message-ID');
    const existingRefs = getHeader(headers, 'References');

    threadId = original.data.threadId ?? undefined;
    inReplyTo = messageId;
    references = existingRefs ? `${existingRefs} ${messageId}` : messageId;
  }

  const raw = createMimeMessage({
    to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
    bcc: params.bcc,
    inReplyTo,
    references,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId,
    },
  });

  return {
    messageId: res.data.id ?? '',
    threadId: res.data.threadId ?? '',
  };
}

export async function replyToMessage(messageId: string, params: ReplyParams): Promise<SendResult> {
  const gmail = await getGmail();
  // Get original message for threading and recipient info
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Message-ID', 'References'],
  });

  const headers = original.data.payload?.headers ?? [];
  const from = getHeader(headers, 'From');
  const subject = getHeader(headers, 'Subject');
  const origMessageId = getHeader(headers, 'Message-ID');
  const existingRefs = getHeader(headers, 'References');

  // Reply to the sender
  const to = [from];

  // Build subject with Re: prefix if not already present
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const raw = createMimeMessage({
    to,
    subject: replySubject,
    body: params.body,
    cc: params.cc,
    bcc: params.bcc,
    inReplyTo: origMessageId,
    references: existingRefs ? `${existingRefs} ${origMessageId}` : origMessageId,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: original.data.threadId ?? undefined,
    },
  });

  return {
    messageId: res.data.id ?? '',
    threadId: res.data.threadId ?? '',
  };
}

export async function forwardMessage(messageId: string, params: ForwardParams): Promise<SendResult> {
  const gmail = await getGmail();
  // Get original message with full content
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = original.data.payload?.headers ?? [];
  const from = getHeader(headers, 'From');
  const subject = getHeader(headers, 'Subject');
  const date = getHeader(headers, 'Date');
  const originalTo = getHeader(headers, 'To');

  // Extract original body
  let originalBody = '';
  function extractBody(part: typeof original.data.payload): void {
    if (part?.body?.data) {
      const decoded = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      if (part.mimeType === 'text/plain') {
        originalBody = decoded;
      } else if (!originalBody && part.mimeType === 'text/html') {
        // Strip HTML as fallback
        originalBody = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    if (part?.parts) {
      for (const child of part.parts) {
        extractBody(child);
      }
    }
  }
  extractBody(original.data.payload);

  // Build forwarded message body
  const forwardHeader = [
    '',
    '---------- Forwarded message ---------',
    `From: ${from}`,
    `Date: ${date}`,
    `Subject: ${subject}`,
    `To: ${originalTo}`,
    '',
  ].join('\n');

  const body = params.additionalBody
    ? `${params.additionalBody}\n${forwardHeader}${originalBody}`
    : `${forwardHeader}${originalBody}`;

  const to = toArray(params.to);
  const fwdSubject = subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`;

  const raw = createMimeMessage({
    to,
    subject: fwdSubject,
    body,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return {
    messageId: res.data.id ?? '',
    threadId: res.data.threadId ?? '',
  };
}
