export type TestItem = {
  id: string;
  label: string;
};

export function getTestMessage(): string;
export function listTestItems(): TestItem[];
