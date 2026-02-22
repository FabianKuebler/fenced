import {
  ExecutionManager,
  StreamedData,
  type RuntimeChannel,
  type ExecutionResult,
} from "@fenced/executor";
import { loadRuntimeSkills, readSkillsData, type SkillData } from "@fenced/skills";
import { parse } from "@fenced/parser";
import {
  createDefaultLlm,
  type Llm,
  type LlmLogsPayload,
  type LlmTextChunk,
} from "@fenced/llm";
import { z } from "zod";
import type { CallbackInvokePayload, InteractionId, MessageId, StreamedDataId } from "@fenced/shared";

export interface RuntimeOptions {
  recordingPath?: string;
}

export class Runtime {
  private static runtimeSkills?: Record<string, unknown>;
  private static skillsData?: SkillData[];

  private readonly channel: RuntimeChannel;
  private readonly executor: ExecutionManager;
  private readonly maxTurns = 15;
  private running = false;
  private stopped = false;
  private llmPromise?: Promise<Llm>;
  private promptSent = false;
  private recordingPath?: string;



  
  constructor(channel: RuntimeChannel, options?: RuntimeOptions) {
    const searchContacts = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000) );
      return [{
        name: "Nona Oleskov",
        email: "nona.oleskov@example.com"
      }]
    };
  
  
    const sendMail = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000) );
    };
    this.channel = channel;
    this.recordingPath = options?.recordingPath;
    const skills = Runtime.runtimeSkills ?? {};
    this.executor = new ExecutionManager({ channel, skills: { z, ...skills, searchContacts, sendMail } });
  }

  async init(): Promise<void> {
    const llm = await this.getLlm();
    this.sendPromptTraces(llm);
  }

  private sendPromptTraces(llm: Llm): void {
    if (this.promptSent) return;
    const interactionId = "init" as InteractionId;
    const messageId = "prompt" as MessageId;
    for (const msg of llm.getInitialHistory()) {
      const category = msg.role === "system" ? "system"
        : msg.role === "user" ? "example_user"
        : "example_assistant";
      this.channel.sendTrace?.({ interactionId, messageId, text: msg.content, category });
    }
    this.promptSent = true;
  }

  static async loadSkills(): Promise<{ runtime: Record<string, unknown>; data: SkillData[] }> {
    if (!Runtime.runtimeSkills) {
      Runtime.runtimeSkills = await loadRuntimeSkills();
    }
    if (!Runtime.skillsData) {
      Runtime.skillsData = await readSkillsData();
    }
    return { runtime: Runtime.runtimeSkills, data: Runtime.skillsData };
  }

  async newInteraction(userQuery: string): Promise<{ interactionId: InteractionId }> {
    if (this.running) {
      throw new Error("An interaction is already running");
    }
    this.running = true;
    this.stopped = false;
    const interactionId = crypto.randomUUID() as InteractionId;
    console.log("[runtime] start", { interactionId, userQuery });

    try {
      const llm = await this.getLlm();
      const messageId = crypto.randomUUID() as MessageId;

      // Echo user input to trace
      this.channel.sendTrace?.({ interactionId, messageId, text: userQuery, category: "user" });

      let turn = 0;
      let transcript: LlmLogsPayload = {};
      while (!this.stopped) {
        let stream: AsyncIterable<LlmTextChunk>;

        // On the first turn, check if we should play a recording
        if (turn === 0 && this.recordingPath) {
          stream = this.createRecordingStream();
        } else {
          stream = turn === 0 ? llm.userQuery(userQuery) : llm.logs(transcript);
        }

        transcript = await this.consumeAssistantStream(interactionId, stream);
        if (transcript.error) {
          this.channel.sendTrace?.({
            interactionId,
            messageId,
            text: transcript.error,
            category: "exec_error",
          });
        }
        if (transcript.logs) {
          this.channel.sendTrace?.({
            interactionId,
            messageId,
            text: transcript.logs,
            category: "exec_result",
          });
        }
        console.log("[runtime] turn complete", { interactionId, turn, transcript });
        if (!hasTranscript(transcript)) {
          break;
        }
        turn += 1;
        if (turn >= this.maxTurns) {
          break;
        }
      }
    } finally {
      this.running = false;
    }

    return { interactionId };
  }

  stop(): void {
    this.stopped = true;
    this.executor.stop();
  }

  invokeCallback(payload: CallbackInvokePayload): void {
    this.executor.invokeCallback(payload.mountId, payload.name, payload.args);
  }

  private async getLlm(): Promise<Llm> {
    if (!this.llmPromise) {
      const skills = Runtime.skillsData ?? [];
      this.llmPromise = createDefaultLlm({ skills });
    }
    return this.llmPromise;
  }

  private createRecordingStream(): AsyncIterable<LlmTextChunk> {
    const recordingPath = this.recordingPath!;
    return (async function* () {
      const file = Bun.file(recordingPath);
      const content = await file.text();
      // Stream character by character to simulate LLM streaming
      const chunkSize = 5;
      let halfSpeed = false;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        if (chunk.includes("\u200B")) {
          halfSpeed = true;
        }
        yield { text: chunk };
        // Small delay to simulate streaming (half speed after \u200B)
        await new Promise((resolve) => setTimeout(resolve, halfSpeed ? 30 : 3));
      }
    })();
  }

  private async consumeAssistantStream(
    interactionId: InteractionId,
    stream: AsyncIterable<LlmTextChunk>,
  ): Promise<LlmLogsPayload> {
    const messageId = crypto.randomUUID() as MessageId;
    let transcript: LlmLogsPayload = {};
    const pendingStreams: Promise<unknown>[] = [];
    let pendingExecution: Promise<ExecutionResult> | null = null;

    this.channel.sendAssistantMessage?.({
      interactionId,
      messageId,
      markdown: "<streamed>",
      blocks: [],
    });

    const tappedStream = tapLlmStream(stream, (chunk) => {
      this.channel.sendTrace?.({ interactionId, messageId, text: chunk.text, category: "llm" });
    });

    for await (const segment of parse(toParserChunks(tappedStream))) {
      console.log("[runtime] segment", { kind: segment.kind });

      // Await prior execution before processing the next agent_run block
      // (by the time we receive the next segment, the prior block's stream is closed)
      if (segment.kind === "agent_run" && pendingExecution) {
        const result = await pendingExecution;
        pendingExecution = null;
        transcript = mergeTranscripts(transcript, normalizeResult(result));
      }

      switch (segment.kind) {
        case "markdown": {
          const markdownMessageId = crypto.randomUUID() as MessageId;
          pendingStreams.push(
            this.channel.sendMarkdown?.({ interactionId, messageId: markdownMessageId }, segment.tokens) ??
              Promise.resolve(),
          );
          break;
        }
        case "agent_data": {
          const streamedDataId = segment.streamedDataId as StreamedDataId;

          // Check if target exists
          if (!StreamedData.hasId(streamedDataId)) {
            console.error(`[runtime] unknown_target: ${streamedDataId}`);
            // Skip this block but continue processing
            break;
          }

          // Collect chunks while streaming to client
          const jsonChunks: string[] = [];
          const wrappedStream = (async function* () {
            for await (const chunk of segment.jsonTokens) {
              jsonChunks.push(chunk);
              yield chunk;
            }
          })();

          pendingStreams.push(
            (async () => {
              await (this.channel.sendStreamedData?.(streamedDataId, wrappedStream) ?? Promise.resolve());

              // After stream completes, parse JSON and populate StreamedData on server
              try {
                const fullJson = jsonChunks.join("");
                const parsed = JSON.parse(fullJson) as Record<string, unknown>;
                const streamed = StreamedData.getById(streamedDataId);
                if (streamed) {
                  StreamedData.setData(streamed, parsed);
                  console.log(`[runtime] streamed_data:ok ${streamedDataId}`);
                }
              } catch (err) {
                console.error(`[runtime] Failed to parse streamed data for ${streamedDataId}:`, err);
              }
            })(),
          );
          break;
        }
        case "agent_run": {
          // Ensure any prior streams are awaited before executing code.
          if (pendingStreams.length) {
            await Promise.allSettled(pendingStreams.splice(0));
          }

          // Start streaming execution - tokens are piped as they arrive from parser
          const run = this.executor.run(segment.sourceTokens);

          // Consume events in background (drive the iterator so execution proceeds)
          // The result promise will resolve when the stream closes and execution completes
          pendingExecution = (async () => {
            for await (const event of run.events) {
              // Log each statement execution for debugging/tracing
              if (event.logs) {
                console.log("[runtime] exec logs", event.logs);
              }
              if (event.error) {
                console.log("[runtime] exec error", event.error);
              }
            }
            return run.result;
          })();

          break;
        }
      }
      if (this.stopped) {
        break;
      }
    }

    // Await final execution if any
    if (pendingExecution) {
      const result = await pendingExecution;
      transcript = mergeTranscripts(transcript, normalizeResult(result));
    }

    if (pendingStreams.length) {
      await Promise.allSettled(pendingStreams);
    }

    return transcript;
  }
}

function normalizeResult(result: ExecutionResult): LlmLogsPayload {
  const logs = result.logs?.trim();
  const error = result.error?.message?.trim();
  return {
    logs: logs && logs.length > 0 ? logs : undefined,
    error: error && error.length > 0 ? error : undefined,
  };
}

function mergeTranscripts(current: LlmLogsPayload, next: LlmLogsPayload): LlmLogsPayload {
  const logs = [current.logs, next.logs].filter(Boolean).join("\n").trim();
  const error = [current.error, next.error].filter(Boolean).join("\n").trim();
  return {
    logs: logs.length > 0 ? logs : undefined,
    error: error.length > 0 ? error : undefined,
  };
}

function hasTranscript(payload: LlmLogsPayload): boolean {
  return Boolean((payload.logs && payload.logs.trim()) || (payload.error && payload.error.trim()));
}

function toParserChunks(stream: AsyncIterable<LlmTextChunk>): AsyncIterable<{ text: string }> {
  return (async function* () {
    for await (const chunk of stream) {
      yield { text: chunk.text };
    }
  })();
}

function tapLlmStream(
  stream: AsyncIterable<LlmTextChunk>,
  onChunk: (chunk: LlmTextChunk) => void,
): AsyncIterable<LlmTextChunk> {
  return (async function* () {
    for await (const chunk of stream) {
      onChunk(chunk);
      yield chunk;
    }
  })();
}
