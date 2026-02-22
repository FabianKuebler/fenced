import { getGmail } from './gmail';
import type { CreateDraftParams, ListDraftsParams, ListDraftsResult, Draft } from './types';
import { createMimeMessage, toArray, parseMessageToSummary } from './helpers';

export async function createDraft(params: CreateDraftParams): Promise<{ draftId: string }> {
  const gmail = await getGmail();
  const to = toArray(params.to);

  const raw = createMimeMessage({
    to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
    bcc: params.bcc,
  });

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw },
    },
  });

  return {
    draftId: res.data.id ?? '',
  };
}

export async function listDrafts(params?: ListDraftsParams): Promise<ListDraftsResult> {
  const gmail = await getGmail();
  const res = await gmail.users.drafts.list({
    userId: 'me',
    maxResults: params?.maxResults ?? 10,
    pageToken: params?.pageToken,
  });

  const items = res.data.drafts ?? [];
  if (items.length === 0) {
    return { drafts: [], nextPageToken: undefined };
  }

  const drafts = await Promise.all(
    items.map(async (d) => {
      if (!d.id) {
        return {
          id: '',
          message: {
            id: '',
            threadId: '',
            sender: '',
            subject: '',
            snippet: '',
            date: '',
            labelIds: [],
            isUnread: false,
          },
        } as Draft;
      }

      const gmailClient = await getGmail();
      const draft = await gmailClient.users.drafts.get({
        userId: 'me',
        id: d.id,
        format: 'metadata',
      });

      return {
        id: draft.data.id ?? '',
        message: draft.data.message ? parseMessageToSummary(draft.data.message) : {
          id: '',
          threadId: '',
          sender: '',
          subject: '',
          snippet: '',
          date: '',
          labelIds: [],
          isUnread: false,
        },
      } as Draft;
    })
  );

  return {
    drafts,
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
}

export async function sendDraft(draftId: string): Promise<{ messageId: string }> {
  const gmail = await getGmail();
  const res = await gmail.users.drafts.send({
    userId: 'me',
    requestBody: {
      id: draftId,
    },
  });

  return {
    messageId: res.data.id ?? '',
  };
}

export async function deleteDraft(draftId: string): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.drafts.delete({
    userId: 'me',
    id: draftId,
  });
}
