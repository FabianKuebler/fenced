import { describe, expect, it } from 'bun:test';
import type { ChatMessage, LlmProvider, LlmTextChunk, SkillData } from '../index';
import { Llm } from '../index';

const TEST_SKILLS: SkillData[] = [
  { name: 'test-skill', doc: 'A test skill', types: 'declare function testFn(): void;' },
];

describe('Llm', () => {
  it('streams responses for user queries and records history', async () => {
    const provider = new RecordingProvider([['hello', ' world']]);
    const llm = new Llm({
      model: 'test-model',
      provider,
      skills: TEST_SKILLS,
    });

    const chunks = await collectTexts(llm.userQuery('Hi there'));

    expect(chunks).toEqual(['hello', ' world']);
    expect(provider.calls).toHaveLength(1);

    // First message should be system prompt with skills injected
    const systemMessage = provider.calls[0]?.[0];
    expect(systemMessage?.role).toBe('system');
    expect(systemMessage?.content).toContain('test-skill skill');
    expect(systemMessage?.content).toContain('A test skill');
    expect(systemMessage?.content).toContain('declare function testFn(): void;');

    // Last message should be user query with prefix
    const messages = provider.calls[0];
    const lastMessage = messages?.[messages.length - 1];
    expect(lastMessage).toEqual({
      role: 'user',
      content: '[user query]\nHi there',
    });

    const history = llm.getHistory();
    expect(history.at(-1)).toEqual({
      role: 'assistant',
      content: 'hello world',
    });
  });

  it('formats runtime logs and forwards them as user turns', async () => {
    const provider = new RecordingProvider([['ok']]);
    const llm = new Llm({
      model: 'test-model',
      provider,
      skills: [],
    });

    const logs = ['{"msg":"one"}', '  {"msg":"two"}  '].map((line) => line.trim()).join('\n');
    await collectTexts(llm.logs({ logs }));

    const firstCall = provider.calls[0];
    const userMessage = firstCall?.[firstCall.length - 1];
    expect(userMessage).toEqual({
      role: 'user',
      content: ['[runtime transcript]', '{"msg":"one"}', '{"msg":"two"}'].join('\n'),
    });

    const history = llm.getHistory();
    expect(history.at(-1)).toEqual({ role: 'assistant', content: 'ok' });
  });

  it('rolls back user messages when the provider throws', async () => {
    const provider = new RecordingProvider([[{ error: new Error('boom') }]]);
    const llm = new Llm({
      model: 'test-model',
      provider,
      skills: [],
    });

    await expect(collectTexts(llm.userQuery('broken'))).rejects.toThrow('boom');

    const history = llm.getHistory();
    const initialHistory = llm.getInitialHistory();
    // History should match initial history (user message from broken query rolled back)
    expect(history.length).toBe(initialHistory.length);
    expect(history[0]?.role).toBe('system');
    // No new user messages should have been added beyond those in initial prompt
    expect(history).toEqual(initialHistory);
  });
});

async function collectTexts(iterable: AsyncIterable<LlmTextChunk>): Promise<string[]> {
  const texts: string[] = [];
  for await (const chunk of iterable) {
    texts.push(chunk.text);
  }
  return texts;
}

type ProviderScript = Array<string | { error: Error }>;

class RecordingProvider implements LlmProvider {
  readonly calls: ChatMessage[][] = [];
  private readonly scripts: ProviderScript[];

  constructor(scripts: ProviderScript[]) {
    this.scripts = scripts;
  }

  async *stream(messages: ChatMessage[]): AsyncGenerator<LlmTextChunk> {
    const turnIndex = this.calls.length;
    this.calls.push(messages.map((msg) => ({ ...msg })));
    const script = this.scripts[turnIndex] ?? [];
    for (const entry of script) {
      if (typeof entry === 'string') {
        yield { text: entry };
        continue;
      }
      throw entry.error;
    }
  }
}
