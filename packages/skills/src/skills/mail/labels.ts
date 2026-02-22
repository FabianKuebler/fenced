import { getGmail } from './gmail';
import type { Label } from './types';

export async function listLabels(): Promise<Label[]> {
  const gmail = await getGmail();
  const res = await gmail.users.labels.list({
    userId: 'me',
  });

  const labels = res.data.labels ?? [];

  return labels.map((label) => ({
    id: label.id ?? '',
    name: label.name ?? '',
    type: label.type === 'system' ? 'system' : 'user',
  }));
}

export async function createLabel(name: string): Promise<Label> {
  const gmail = await getGmail();
  const res = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return {
    id: res.data.id ?? '',
    name: res.data.name ?? '',
    type: res.data.type === 'system' ? 'system' : 'user',
  };
}

export async function deleteLabel(labelId: string): Promise<void> {
  const gmail = await getGmail();
  await gmail.users.labels.delete({
    userId: 'me',
    id: labelId,
  });
}
