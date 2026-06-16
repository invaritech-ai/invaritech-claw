import readline from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { Thread } from "../threads/types.js";
import type { NativeOperatorApiClient } from "./operator-api.js";
import {
  createOperatorConsoleState,
  runOperatorCommand,
  runOperatorPrompt,
} from "./operator-console.js";

type OperatorOutput = Writable & {
  isTTY?: boolean;
};

async function openInitialThread(
  client: NativeOperatorApiClient,
  agentId: string,
): Promise<Thread> {
  const defaultTitle = agentId || "main";
  const threads = await client.listThreads({ limit: 100 });
  const existingThread = threads.find((thread) => thread.title === defaultTitle);
  if (existingThread) {
    return existingThread;
  }
  return await client.createThread({ title: defaultTitle });
}

function writeHeader(output: Writable, input: { agentId: string; activeThread: Thread }): void {
  output.write(`iclaw tui connected as ${input.agentId}\n`);
  output.write(`thread: ${input.activeThread.title} (${input.activeThread.id})\n`);
  output.write(`model: ${input.activeThread.activeModelRef}\n`);
  output.write("Type a prompt, /help, or /exit.\n");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runInteractiveOperatorConsole(input: {
  agentId: string;
  client: NativeOperatorApiClient;
  input: Readable;
  output: OperatorOutput;
}): Promise<void> {
  const initialThread = await openInitialThread(input.client, input.agentId);
  let state = createOperatorConsoleState({
    selectedAgentId: input.agentId,
    activeThread: initialThread,
  });

  const rl = readline.createInterface({
    input: input.input,
    output: input.output,
    terminal: input.output.isTTY === true,
  });

  writeHeader(input.output, { agentId: input.agentId, activeThread: initialThread });

  try {
    input.output.write("> ");
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        input.output.write("> ");
        continue;
      }

      try {
        if (trimmed.startsWith("/")) {
          const result = await runOperatorCommand({
            state,
            client: input.client,
            command: trimmed,
          });
          state = result.state;
          if (result.output === null) {
            break;
          }
          input.output.write(`${result.output}\n`);
          input.output.write("> ");
          continue;
        }

        if (!state.activeThread) {
          input.output.write("error: no active thread; use /new or /thread switch <id>\n");
          input.output.write("> ");
          continue;
        }

        const output = await runOperatorPrompt({
          threadId: state.activeThread.id,
          client: input.client,
          prompt: trimmed,
        });
        input.output.write(`${output}\n`);
        input.output.write("> ");
      } catch (error) {
        input.output.write(`error: ${formatError(error)}\n`);
        input.output.write("> ");
      }
    }
  } finally {
    rl.close();
  }
}
