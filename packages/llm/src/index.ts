import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type CoreMessage } from 'ai';
import { loadConversation, type SkillData, type PromptMessage } from './prompt';

export type { SkillData, PromptMessage };

export type LlmTextChunk = {
  text: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmProvider = {
  stream(messages: ChatMessage[], params?: Record<string, unknown>): AsyncIterable<LlmTextChunk>;
};

export type LlmLogsPayload = {
  logs?: string;
  error?: string;
};

export type LlmOptions = {
  model: string;
  provider: LlmProvider;
  skills: SkillData[];
};

export type CreateDefaultLlmOptions = {
  model?: string;
  apiKey?: string;
  skills: SkillData[];
};

export class Llm {
  private readonly provider: LlmProvider;
  private readonly model: string;
  private readonly readyPromise: Promise<void>;
  private history: ChatMessage[] = [];
  private initialHistory: ChatMessage[] = [];

  constructor(options: LlmOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.readyPromise = this.initialize(options);
  }

  userQuery(text: string): AsyncIterable<LlmTextChunk> {
    return this.runTurn({ role: 'user', content: `[user query]\n${text}` });
  }

  logs(payload: LlmLogsPayload): AsyncIterable<LlmTextChunk> {
    return this.runTurn({ role: 'user', content: formatLogs(payload) });
  }

  async reset(): Promise<void> {
    await this.readyPromise;
    this.history = cloneMessages(this.initialHistory);
  }

  async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  getHistory(): ChatMessage[] {
    return this.history.map((entry) => ({ ...entry }));
  }

  getInitialHistory(): ChatMessage[] {
    return this.initialHistory.map((entry) => ({ ...entry }));
  }

  private async initialize(options: LlmOptions) {
    const messages = await loadConversation({ skills: options.skills });
    this.initialHistory = messages;
    this.history = cloneMessages(messages);
  }

  private runTurn(message: ChatMessage): AsyncIterable<LlmTextChunk> {
    return (async function* (ctx: Llm): AsyncGenerator<LlmTextChunk> {
      await ctx.readyPromise;
      const rollbackIndex = ctx.history.length;
      ctx.history.push({ ...message });
      const snapshot = cloneMessages(ctx.history);
      let assistantContent = '';

      try {
        const stream = ctx.provider.stream(snapshot, { model: ctx.model });
        for await (const chunk of stream) {
          assistantContent += chunk.text;
          yield chunk;
        }
        ctx.history.push({ role: 'assistant', content: assistantContent });
      } catch (error) {
        ctx.history.splice(rollbackIndex, ctx.history.length - rollbackIndex);
        throw error;
      }
    })(this);
  }
}

function formatLogs(payload: LlmLogsPayload): string {
  const parts: string[] = [];
  const logs = payload.logs?.trim();
  const error = payload.error?.trim();

  if (logs) {
    parts.push(logs);
  }
  if (error) {
    parts.push(`ERROR: ${error}`);
  }

  if (parts.length === 0) {
    return '[runtime transcript]\n<empty>';
  }

  return `[runtime transcript]\n${parts.join('\n')}`;
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({ ...message }));
}

const DEFAULT_MODEL = 'gpt-5.2';

export async function createDefaultLlm(options: CreateDefaultLlmOptions): Promise<Llm> {
  const model = options.model ?? DEFAULT_MODEL;
  const apiKey = resolveApiKey(options.apiKey);
  const provider = createOpenAiProvider({ apiKey });
  const llm = new Llm({ model, provider, skills: options.skills });
  await llm.whenReady();
  return llm;
}

type CreateOpenAiProviderOptions = {
  apiKey: string;
};

export function createOpenAiProvider(options: CreateOpenAiProviderOptions): LlmProvider {
  const openai = createOpenAI({ apiKey: options.apiKey });

  return {
    async *stream(messages: ChatMessage[], params?: Record<string, unknown>): AsyncGenerator<LlmTextChunk> {
      const modelId = typeof params?.model === 'string' ? params.model : DEFAULT_MODEL;
      const result = await streamText({
        model: openai(modelId),
        messages: toProviderMessages(messages),
      });

      for await (const textChunk of result.textStream) {
        if (textChunk) {
          yield { text: textChunk };
        }
      }

      // Log cached prompt tokens (if provided by the provider).
      try {
        const usage = await result.usage;
        console.info('usage.prompt_tokens_details.cached_tokens', usage?.cachedInputTokens ?? null);
      } catch {
        console.info('usage.prompt_tokens_details.cached_tokens', null);
      }
    },
  };
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not set.');
    this.name = 'MissingApiKeyError';
  }
}

function resolveApiKey(explicit?: string): string {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const bunEnv = (globalThis as { Bun?: { env?: Record<string, string | undefined> } }).Bun?.env?.OPENAI_API_KEY;
  const envValue = bunEnv ?? process.env.OPENAI_API_KEY;

  if (!envValue) {
    throw new MissingApiKeyError();
  }

  return envValue.trim();
}

function toProviderMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
