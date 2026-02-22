export type TestItem = {
  id: string;
  label: string;
};

const TEST_DATA: { message: string; items: TestItem[] } = {
  message: 'Test skill ready',
  items: [
    { id: 'alpha', label: 'Alpha item' },
    { id: 'beta', label: 'Beta item' },
    { id: 'gamma', label: 'Gamma item' },
  ],
};

export function getTestMessage(): string {
  return TEST_DATA.message;
}

export function listTestItems(): TestItem[] {
  return TEST_DATA.items.map((item) => ({ ...item }));
}
