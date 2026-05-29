import readline from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { NativeOperatorApiClient } from "./operator-api.js";
import { runOperatorCommand, runOperatorPrompt } from "./operator-console.js";

type OperatorOutput = Writable & {
  isTTY?: boolean;
};

export async function runInteractiveOperatorConsole(input: {
  agentId: string;
  client: NativeOperatorApiClient;
  input: Readable;
  output: OperatorOutput;
}): Promise<void> {
  const rl = readline.createInterface({
    input: input.input,
    output: input.output,
    terminal: input.output.isTTY === true,
  });

  input.output.write(`iclaw tui connected as ${input.agentId}\n`);
  input.output.write("Type a prompt, /status, /runs, or /exit.\n");

  try {
    input.output.write("> ");
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        input.output.write("> ");
        continue;
      }

      const output = trimmed.startsWith("/")
        ? await runOperatorCommand({
            agentId: input.agentId,
            client: input.client,
            command: trimmed,
          })
        : await runOperatorPrompt({
            agentId: input.agentId,
            client: input.client,
            prompt: trimmed,
          });

      if (output === null) {
        break;
      }
      input.output.write(`${output}\n`);
      input.output.write("> ");
    }
  } finally {
    rl.close();
  }
}
