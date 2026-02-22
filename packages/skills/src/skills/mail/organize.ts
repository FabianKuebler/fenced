import { getGmail } from './gmail';
import type { ModifyLabelsParams } from './types';
import { toArray } from './helpers';

export async function modifyLabels(messageId: string, params: ModifyLabelsParams): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: params.addLabelIds,
      removeLabelIds: params.removeLabelIds,
    },
  });
}

async function batchModifyLabels(
  messageIds: string[],
  addLabelIds?: string[],
  removeLabelIds?: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  const gmail = await getGmail();
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: messageIds,
      addLabelIds,
      removeLabelIds,
    },
  });
}

export async function markAsRead(messageIds: string | string[]): Promise<void> {
  const ids = toArray(messageIds);
  await batchModifyLabels(ids, undefined, ['UNREAD']);
}

export async function markAsUnread(messageIds: string | string[]): Promise<void> {
  const ids = toArray(messageIds);
  await batchModifyLabels(ids, ['UNREAD'], undefined);
}

export async function archiveMessages(messageIds: string | string[]): Promise<void> {
  const ids = toArray(messageIds);
  await batchModifyLabels(ids, undefined, ['INBOX']);
}

export async function trashMessage(messageId: string): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.messages.trash({
    userId: 'me',
    id: messageId,
  });
}

export async function untrashMessage(messageId: string): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.messages.untrash({
    userId: 'me',
    id: messageId,
  });
}

export async function deleteMessagePermanently(messageId: string): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.messages.delete({
    userId: 'me',
    id: messageId,
  });
}
