import type { gmail_v1 } from 'googleapis';
import type { MessageSummary, MessageDetail, AttachmentInfo } from './types';

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function getHeaders(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string[] {
  const value = getHeader(headers, name);
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseMessageToSummary(msg: gmail_v1.Schema$Message): MessageSummary {
  const headers = msg.payload?.headers ?? [];
  return {
    id: msg.id ?? '',
    threadId: msg.threadId ?? '',
    sender: getHeader(headers, 'From'),
    subject: getHeader(headers, 'Subject'),
    snippet: msg.snippet ?? '',
    date: getHeader(headers, 'Date'),
    labelIds: msg.labelIds ?? [],
    isUnread: msg.labelIds?.includes('UNREAD') ?? false,
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  // Direct body data
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart - look for text/plain first, then text/html
  if (payload.parts) {
    // Try text/plain first
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to text/html
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return stripHtml(html);
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];

  function traverse(part: gmail_v1.Schema$MessagePart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
      });
    }
    if (part.parts) {
      for (const child of part.parts) {
        traverse(child);
      }
    }
  }

  if (payload) traverse(payload);
  return attachments;
}

export function parseMessageToDetail(msg: gmail_v1.Schema$Message): MessageDetail {
  const headers = msg.payload?.headers ?? [];
  return {
    id: msg.id ?? '',
    threadId: msg.threadId ?? '',
    sender: getHeader(headers, 'From'),
    subject: getHeader(headers, 'Subject'),
    snippet: msg.snippet ?? '',
    date: getHeader(headers, 'Date'),
    labelIds: msg.labelIds ?? [],
    isUnread: msg.labelIds?.includes('UNREAD') ?? false,
    to: getHeaders(headers, 'To'),
    cc: getHeaders(headers, 'Cc'),
    body: extractBody(msg.payload),
    attachments: extractAttachments(msg.payload),
  };
}

export function createMimeMessage(params: {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  inReplyTo?: string;
  references?: string;
  from?: string;
}): string {
  const lines: string[] = [];

  lines.push(`To: ${params.to.join(', ')}`);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(', ')}`);
  if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(', ')}`);
  lines.push(`Subject: ${params.subject}`);
  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('MIME-Version: 1.0');
  lines.push('');
  lines.push(params.body);

  const message = lines.join('\r\n');
  return Buffer.from(message).toString('base64url');
}

export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
