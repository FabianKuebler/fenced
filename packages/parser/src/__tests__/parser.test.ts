import { describe, expect, it } from 'bun:test';
import type { AgentDataSegment, AgentRunSegment, MarkdownSegment, ParserSegment } from '../index';
import { parse } from '../index';

describe('parser', () => {
  it('emits markdown and agent.run segments in order', async () => {
    const input = [
      'Hello!\n\n```tsx agent.run\nconsole.log("hi");\n```\nTail',
    ];

    const segments = await collectSegments(parseChunks(input));

    expect(segments).toHaveLength(3);
    const first = segments[0] as MarkdownSegment;
    expect(first.kind).toBe('markdown');
    expect(await collectString(first.tokens)).toEqual('Hello!\n\n');

    const second = segments[1] as AgentRunSegment;
    expect(second).toMatchObject({
      kind: 'agent_run',
      index: 0,
    });
    expect(await collectString(second.sourceTokens)).toBe('console.log("hi");\n');

    const third = segments[2] as MarkdownSegment;
    expect(await collectString(third.tokens)).toEqual('\nTail');
  });

  it('parses agent.data blocks with data ids', async () => {
    const segments = await collectSegments(
      parseChunks([
        '```json agent.data => "mount-1"\n{"count":1}\n```\n',
      ]),
    );

    expect(segments.length).toBeGreaterThan(0);
    const dataSegment = segments.find((segment): segment is AgentDataSegment => segment.kind === 'agent_data');
    expect(dataSegment).toBeTruthy();
    if (!dataSegment) {
      throw new Error('Missing agent_data segment');
    }
    expect(dataSegment.kind).toBe('agent_data');
    expect(dataSegment.streamedDataId).toBe('mount-1');
    expect(dataSegment.index).toBe(0);
    expect(await collectString(dataSegment.jsonTokens)).toEqual('{"count":1}\n');
  });

  it('treats unknown fences as markdown', async () => {
    const source = 'Intro\n```bash\nls\n```\n';
    const [segment] = await collectSegments(parseChunks([source]));
    const markdown = segment as MarkdownSegment;
    expect(markdown.kind).toBe('markdown');
    expect(await collectString(markdown.tokens)).toEqual(source);
  });

  it('handles fences split across chunk boundaries', async () => {
    const segments = await collectSegments(
      parseChunks([
        'Alpha\n``',
        '`tsx agent.run\nconsole.log("chunk");\n`',
        '``\nOmega',
      ]),
    );

    expect(segments).toHaveLength(3);
    expect((segments[0] as MarkdownSegment).kind).toBe('markdown');
    expect(await collectString((segments[0] as MarkdownSegment).tokens)).toEqual('Alpha\n');
    expect(await collectString((segments[1] as AgentRunSegment).sourceTokens)).toContain('console.log("chunk");');
    expect(await collectString((segments[2] as MarkdownSegment).tokens)).toEqual('\nOmega');
  });

  it('keeps a shared block index across block types', async () => {
    const segments = await collectSegments(
      parseChunks([
        '```tsx agent.run\nconsole.log("one");\n```\n',
        '```json agent.data => "panel"\n{}\n```\n',
      ]),
    );

    const runSegment = segments.find((segment): segment is AgentRunSegment => segment.kind === 'agent_run');
    const dataSegment = segments.find((segment): segment is AgentDataSegment => segment.kind === 'agent_data');
    expect(runSegment?.index).toBe(0);
    expect(dataSegment?.index).toBe(1);
  });

  it('streams markdown tokens as soon as they arrive', async () => {
    async function* chunks() {
      yield { text: 'Hel' };
      yield { text: 'lo' };
      yield { text: '!' };
    }

    const segments = await collectSegments(parse(chunks()));
    expect(segments).toHaveLength(1);
    const markdown = segments[0] as MarkdownSegment;
    const tokens: string[] = [];
    const iterator = markdown.tokens[Symbol.asyncIterator]();
    tokens.push((await iterator.next()).value);
    tokens.push((await iterator.next()).value);
    tokens.push((await iterator.next()).value);
    expect(tokens).toEqual(['Hel', 'lo', '!']);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('skips whitespace-only content between fences', async () => {
    const segments = await collectSegments(
      parseChunks([
        '```tsx agent.run\nconsole.log("one");\n```\n\n```tsx agent.run\nconsole.log("two");\n```',
      ]),
    );

    // Should only have 2 agent_run segments, no markdown segment for the whitespace
    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe('agent_run');
    expect(segments[1].kind).toBe('agent_run');
    expect(await collectString((segments[0] as AgentRunSegment).sourceTokens)).toContain('console.log("one")');
    expect(await collectString((segments[1] as AgentRunSegment).sourceTokens)).toContain('console.log("two")');
  });

  it('preserves whitespace within markdown segments', async () => {
    const segments = await collectSegments(
      parseChunks([
        'Hello\n\nWorld\n\n```tsx agent.run\nconsole.log("hi");\n```',
      ]),
    );

    expect(segments).toHaveLength(2);
    const markdown = segments[0] as MarkdownSegment;
    expect(markdown.kind).toBe('markdown');
    // Whitespace between "Hello" and "World" should be preserved
    expect(await collectString(markdown.tokens)).toEqual('Hello\n\nWorld\n\n');
  });
});

async function collectSegments(iterable: AsyncIterable<ParserSegment>): Promise<ParserSegment[]> {
  const segments: ParserSegment[] = [];
  for await (const segment of iterable) {
    segments.push(segment);
  }
  return segments;
}

async function collectString(iterable: AsyncIterable<string>): Promise<string> {
  let result = '';
  for await (const chunk of iterable) {
    result += chunk;
  }
  return result;
}

function parseChunks(chunks: string[]): AsyncIterable<ParserSegment> {
  async function* stream() {
    for (const text of chunks) {
      yield { text };
    }
  }
  return parse(stream());
}
