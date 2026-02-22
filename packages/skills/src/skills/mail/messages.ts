import { getGmail } from './gmail';
import type { MessageSummary, MessageDetail, ListMessagesParams, ListMessagesResult, AttachmentData } from './types';
import { parseMessageToSummary, parseMessageToDetail } from './helpers';

export async function listMessages(params?: ListMessagesParams): Promise<ListMessagesResult> {
  const gmail = await getGmail();
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: params?.maxResults ?? 10,
    q: params?.q,
    labelIds: params?.labelIds,
    pageToken: params?.pageToken,
  });

  const items = res.data.messages ?? [];
  if (items.length === 0) {
    return { messages: [], nextPageToken: undefined };
  }

  const messages = await Promise.all(
    items.map(async (m) => {
      if (!m.id) {
        return {
          id: '',
          threadId: '',
          sender: '',
          subject: '',
          snippet: '',
          date: '',
          labelIds: [],
          isUnread: false,
        } as MessageSummary;
      }

      const gmailClient = await getGmail();
      const msg = await gmailClient.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      return parseMessageToSummary(msg.data);
    })
  );

  return {
    messages,
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

export async function getMessage(messageId: string): Promise<MessageDetail> {
  const gmail = await getGmail();
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return parseMessageToDetail(res.data);
}

export async function getThread(threadId: string): Promise<MessageDetail[]> {
  const gmail = await getGmail();
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages = res.data.messages ?? [];
  return messages.map(parseMessageToDetail);
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
  const gmail = await getGmail();
  // First get the message to find the attachment metadata
  const msgRes = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  let filename = 'attachment';
  let mimeType = 'application/octet-stream';

  function findAttachment(part: typeof msgRes.data.payload): void {
    if (part?.body?.attachmentId === attachmentId && part.filename) {
      filename = part.filename;
      mimeType = part.mimeType ?? mimeType;
    }
    if (part?.parts) {
      for (const child of part.parts) {
        findAttachment(child);
      }
    }
  }

  findAttachment(msgRes.data.payload);

  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  return {
    data: res.data.data ?? '',
    filename,
    mimeType,
  };
}

export async function searchMail(query: string, maxResults: number = 10): Promise<MessageSummary[]> {
  const result = await listMessages({ q: query, maxResults });
  return result.messages;
}
