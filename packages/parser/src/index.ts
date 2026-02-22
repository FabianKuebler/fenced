const FENCE = '```';
const MAX_TAIL = FENCE.length - 1;

export type MarkdownSegment = {
  kind: 'markdown';
  tokens: AsyncIterable<string>;
};

export type AgentRunSegment = {
  kind: 'agent_run';
  index: number;
  sourceTokens: AsyncIterable<string>;
};

export type AgentDataSegment = {
  kind: 'agent_data';
  index: number;
  streamedDataId: string;
  jsonTokens: AsyncIterable<string>;
};

export type ParserSegment = MarkdownSegment | AgentRunSegment | AgentDataSegment;

export type TextChunk = {
  text: string;
};

export async function* parse(chunks: AsyncIterable<TextChunk>): AsyncIterable<ParserSegment> {
  const parser = new SegmentParser();

  for await (const chunk of chunks) {
    parser.append(chunk.text ?? '');
    yield* parser.drain(false);
  }

  yield* parser.drain(true);
}

type TokenStream = {
  iterator: AsyncIterable<string>;
  push: (chunk: string) => void;
  close: () => void;
};

type BlockInfo =
  | { kind: 'agent_run'; headerSource: string }
  | { kind: 'agent_data'; streamedDataId: string };

type ActiveBlock =
  | { kind: 'agent_run'; index: number; stream: TokenStream; headerSource: string; lastNonWhitespaceChar?: string }
  | { kind: 'agent_data'; stream: TokenStream }
  | { kind: 'passthrough'; stream: TokenStream };

class SegmentParser {
  private buffer = '';
  private blockIndex = 0;
  private markdownStream?: TokenStream;
  private activeBlock?: ActiveBlock;

  append(text: string) {
    if (!text) {
      return;
    }
    this.buffer += text;
  }

  *drain(final: boolean): Generator<ParserSegment> {
    while (true) {
      if (this.activeBlock) {
        const result = this.consumeActiveBlock(final);
        if (result.segments) {
          for (const segment of result.segments) {
            yield segment;
          }
        }
        if (!result.progressed) {
          break;
        }
        continue;
      }

      const fenceIdx = this.buffer.indexOf(FENCE);
      if (fenceIdx === -1) {
        yield* this.flushMarkdown(final);
        break;
      }

      if (fenceIdx > 0) {
        const chunk = this.buffer.slice(0, fenceIdx);
        this.buffer = this.buffer.slice(fenceIdx);
        yield* this.pushMarkdown(chunk);
        continue;
      }

      if (!this.buffer.startsWith(FENCE)) {
        // Should not happen, but guard to avoid infinite loops.
        yield* this.pushMarkdown(this.buffer.charAt(0));
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const headerEnd = this.buffer.indexOf('\n', FENCE.length);
      if (headerEnd === -1) {
        if (final) {
          // Treat unterminated fence as plain markdown when stream ends.
          yield* this.pushMarkdown(this.buffer);
          this.buffer = '';
          this.closeMarkdownStream();
        }
        break;
      }

      const rawHeader = stripCarriageReturn(this.buffer.slice(FENCE.length, headerEnd));
      const header = rawHeader.trim();
      const blockInfo = this.parseHeader(header, rawHeader);
      this.buffer = this.buffer.slice(headerEnd + 1);

      if (!blockInfo) {
        const { stream, segment } = this.ensureMarkdownStream();
        if (segment) {
          yield segment;
        }
        stream.push(`${FENCE}${rawHeader}\n`);
        this.activeBlock = { kind: 'passthrough', stream };
        continue;
      }

      this.closeMarkdownStream();
      const segment = this.openBlock(blockInfo);
      if (segment) {
        yield segment;
      }
    }
  }

  private *flushMarkdown(final: boolean): Generator<ParserSegment> {
    if (!this.buffer) {
      if (final) {
        this.closeMarkdownStream();
      }
      return;
    }

    const keep = final ? 0 : Math.min(countTrailingBackticks(this.buffer), MAX_TAIL);
    const emitLength = this.buffer.length - keep;
    if (emitLength > 0) {
      const chunk = this.buffer.slice(0, emitLength);
      this.buffer = this.buffer.slice(emitLength);
      yield* this.pushMarkdown(chunk);
    }

    if (final) {
      if (this.buffer.length) {
        yield* this.pushMarkdown(this.buffer);
        this.buffer = '';
      }
      this.closeMarkdownStream();
    }
  }

  private *pushMarkdown(text: string): Generator<ParserSegment> {
    if (!text) {
      return;
    }
    // If we don't have an active markdown stream and text is whitespace-only,
    // skip creating a new segment (avoids empty text blocks between fences)
    if (!this.markdownStream && isWhitespaceOnly(text)) {
      return;
    }
    const { stream, segment } = this.ensureMarkdownStream();
    if (segment) {
      yield segment;
    }
    stream.push(text);
  }

  private ensureMarkdownStream(): { stream: TokenStream; segment?: MarkdownSegment } {
    if (this.markdownStream) {
      return { stream: this.markdownStream };
    }
    const stream = createTokenStream();
    this.markdownStream = stream;
    return {
      stream,
      segment: {
        kind: 'markdown',
        tokens: stream.iterator,
      },
    };
  }

  private closeMarkdownStream() {
    if (!this.markdownStream) {
      return;
    }
    this.markdownStream.close();
    this.markdownStream = undefined;
  }

  private parseHeader(header: string, rawHeader: string): BlockInfo | undefined {
    if (isAgentRunHeader(header)) {
      return { kind: 'agent_run', headerSource: `${FENCE}${rawHeader}\n` };
    }
    const dataMatch = matchAgentDataHeader(header);
    if (dataMatch) {
      return { kind: 'agent_data', streamedDataId: dataMatch };
    }
    return undefined;
  }

  private openBlock(info: BlockInfo): ParserSegment {
    if (info.kind === 'agent_run') {
      const stream = createTokenStream();
      const index = this.blockIndex++;
      this.activeBlock = {
        kind: 'agent_run',
        index,
        stream,
        headerSource: info.headerSource,
      };
      return {
        kind: 'agent_run',
        index,
        sourceTokens: stream.iterator,
      };
    }

    const stream = createTokenStream();
    this.activeBlock = { kind: 'agent_data', stream };
    return {
      kind: 'agent_data',
      index: this.blockIndex++,
      streamedDataId: info.streamedDataId,
      jsonTokens: stream.iterator,
    };
  }

  private consumeActiveBlock(final: boolean): { progressed: boolean; segments?: ParserSegment[] } {
    const block = this.activeBlock;
    if (!block) {
      return { progressed: true };
    }

    switch (block.kind) {
      case 'agent_run':
        return this.consumeAgentRunBlock(block, final);
      case 'agent_data':
        return this.consumeAgentDataBlock(block, final);
      case 'passthrough':
        return this.consumePassthroughBlock(block, final);
      default:
        return { progressed: true };
    }
  }

  private consumeAgentRunBlock(
    block: Extract<ActiveBlock, { kind: 'agent_run' }>,
    final: boolean,
  ): { progressed: boolean; segments?: ParserSegment[] } {
    const closeIdx = this.buffer.indexOf(FENCE);
    if (closeIdx === -1) {
      const emitLength = final ? this.buffer.length : Math.max(0, this.buffer.length - MAX_TAIL);
      if (emitLength > 0) {
        const chunk = this.buffer.slice(0, emitLength);
        block.stream.push(chunk);
        updateLastNonWhitespace(block, chunk);
        this.buffer = this.buffer.slice(emitLength);
      }
      if (final) {
        if (this.buffer.length) {
          block.stream.push(this.buffer);
          updateLastNonWhitespace(block, this.buffer);
          this.buffer = '';
        }
        this.closeAgentRunBlock(block);
        return { progressed: true };
      }
      return { progressed: emitLength > 0 };
    }

    if (closeIdx > 0) {
      const chunk = this.buffer.slice(0, closeIdx);
      block.stream.push(chunk);
      updateLastNonWhitespace(block, chunk);
    }
    this.buffer = this.buffer.slice(closeIdx + FENCE.length);
    this.closeAgentRunBlock(block);
    return { progressed: true };
  }

  private closeAgentRunBlock(block: Extract<ActiveBlock, { kind: 'agent_run' }>) {
    // Add trailing semicolon if block doesn't end with one (ignoring whitespace)
    // This ensures the executor can split on semicolons reliably
    const lastNonWs = block.lastNonWhitespaceChar;
    if (lastNonWs && lastNonWs !== ';') {
      block.stream.push(';');
    }
    block.stream.close();
    this.activeBlock = undefined;
  }

  private consumeAgentDataBlock(
    block: Extract<ActiveBlock, { kind: 'agent_data' }>,
    final: boolean,
  ): { progressed: boolean } {
    const closeIdx = this.buffer.indexOf(FENCE);
    if (closeIdx === -1) {
      const emitLength = final ? this.buffer.length : Math.max(0, this.buffer.length - MAX_TAIL);
      if (emitLength > 0) {
        block.stream.push(this.buffer.slice(0, emitLength));
        this.buffer = this.buffer.slice(emitLength);
      }
      if (final) {
        if (this.buffer.length) {
          block.stream.push(this.buffer);
          this.buffer = '';
        }
        block.stream.close();
        this.activeBlock = undefined;
        return { progressed: true };
      }
      return { progressed: emitLength > 0 };
    }

    if (closeIdx > 0) {
      block.stream.push(this.buffer.slice(0, closeIdx));
    }
    this.buffer = this.buffer.slice(closeIdx + FENCE.length);
    block.stream.close();
    this.activeBlock = undefined;
    return { progressed: true };
  }

  private consumePassthroughBlock(
    block: Extract<ActiveBlock, { kind: 'passthrough' }>,
    final: boolean,
  ): { progressed: boolean } {
    const closeIdx = this.buffer.indexOf(FENCE);
    if (closeIdx === -1) {
      if (!final) {
        const keep = Math.min(countTrailingBackticks(this.buffer), MAX_TAIL);
        const emitLength = this.buffer.length - keep;
        if (emitLength <= 0) {
          return { progressed: false };
        }
        block.stream.push(this.buffer.slice(0, emitLength));
        this.buffer = this.buffer.slice(emitLength);
        return { progressed: true };
      }

      block.stream.push(this.buffer);
      this.buffer = '';
      this.activeBlock = undefined;
      return { progressed: true };
    }

    if (closeIdx > 0) {
      block.stream.push(this.buffer.slice(0, closeIdx));
    }
    this.buffer = this.buffer.slice(closeIdx + FENCE.length);
    block.stream.push(FENCE);
    this.activeBlock = undefined;
    return { progressed: true };
  }
}

function createTokenStream(): TokenStream {
  const queue: string[] = [];
  const waiters: Array<(result: IteratorResult<string>) => void> = [];
  let closed = false;

  async function* iterator(): AsyncGenerator<string> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as string;
        continue;
      }
      if (closed) {
        return;
      }
      const result = await new Promise<IteratorResult<string>>((resolve) => waiters.push(resolve));
      if (result.done) {
        return;
      }
      yield result.value as string;
    }
  }

  function push(chunk: string) {
    if (!chunk || closed) {
      return;
    }
    if (waiters.length > 0) {
      waiters.shift()?.({ value: chunk, done: false });
    } else {
      queue.push(chunk);
    }
  }

  function close() {
    if (closed) {
      return;
    }
    closed = true;
    while (waiters.length > 0) {
      waiters.shift()?.({ value: undefined as never, done: true });
    }
  }

  return {
    iterator: iterator(),
    push,
    close,
  };
}

function isAgentRunHeader(header: string): boolean {
  return header.toLowerCase() === 'tsx agent.run';
}

function matchAgentDataHeader(header: string): string | undefined {
  const match = header.match(/^json\s+agent\.data\s*=>\s*["']([^"']+)["']$/i);
  return match?.[1];
}

function stripCarriageReturn(value: string): string {
  return value.endsWith('\r') ? value.slice(0, -1) : value;
}

function countTrailingBackticks(value: string): number {
  let count = 0;
  for (let i = value.length - 1; i >= 0 && count < MAX_TAIL; i -= 1) {
    if (value[i] === '`') {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function updateLastNonWhitespace(
  block: Extract<ActiveBlock, { kind: 'agent_run' }>,
  chunk: string,
) {
  for (let i = chunk.length - 1; i >= 0; i--) {
    const c = chunk[i];
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
      block.lastNonWhitespaceChar = c;
      return;
    }
  }
  // All whitespace - keep previous value
}

function isWhitespaceOnly(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    // Include zero-width space (U+200B) as whitespace
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '\u200B') {
      return false;
    }
  }
  return true;
}
