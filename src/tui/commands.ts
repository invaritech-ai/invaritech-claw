export type MemoryCommandScope = "active" | "thread" | "global";

export type OperatorCommand =
  | { type: "help" }
  | { type: "exit" }
  | { type: "status" }
  | { type: "thread.new"; title: string | null }
  | { type: "thread.list" }
  | { type: "thread.switch"; target: string }
  | { type: "thread.rename"; title: string }
  | { type: "thread.archive"; target: string | null }
  | { type: "objective.show" }
  | { type: "objective.set"; objective: string }
  | { type: "model.show" }
  | { type: "model.list" }
  | { type: "model.set"; modelRef: string }
  | { type: "memory.remember"; scope: Exclude<MemoryCommandScope, "active">; content: string }
  | { type: "memory.list"; scope: MemoryCommandScope; query: string | null }
  | { type: "memory.used" }
  | { type: "memory.forget"; target: string }
  | { type: "context.preview" }
  | { type: "context.full" }
  | { type: "compact" }
  | { type: "summary" }
  | { type: "prompts" }
  | { type: "unknown"; input: string; message: string };

function restAfter(input: string, prefix: string): string {
  return input.slice(prefix.length).trim();
}

function unknown(input: string, message?: string): OperatorCommand {
  return {
    type: "unknown",
    input,
    message: message ?? `unknown command: ${input}`,
  };
}

function parseThreadCommand(input: string): OperatorCommand {
  const rest = restAfter(input, "/thread");
  if (rest === "list") {
    return { type: "thread.list" };
  }
  if (rest.startsWith("switch ")) {
    const target = restAfter(rest, "switch");
    return target ? { type: "thread.switch", target } : unknown(input, "thread target is required");
  }
  if (rest.startsWith("rename ")) {
    const title = restAfter(rest, "rename");
    return title ? { type: "thread.rename", title } : unknown(input, "thread title is required");
  }
  if (rest === "archive") {
    return { type: "thread.archive", target: null };
  }
  if (rest.startsWith("archive ")) {
    const target = restAfter(rest, "archive");
    return target
      ? { type: "thread.archive", target }
      : unknown(input, "thread target is required");
  }
  if (rest.startsWith("new")) {
    const title = restAfter(rest, "new");
    return { type: "thread.new", title: title || null };
  }
  return unknown(input);
}

function parseModelCommand(input: string): OperatorCommand {
  const rest = restAfter(input, "/model");
  if (!rest) {
    return { type: "model.show" };
  }
  if (rest === "list") {
    return { type: "model.list" };
  }
  if (rest.startsWith("set")) {
    const modelRef = restAfter(rest, "set");
    return modelRef ? { type: "model.set", modelRef } : unknown(input, "model ref is required");
  }
  return unknown(input);
}

function parseRememberCommand(input: string): OperatorCommand {
  const rest = restAfter(input, "/remember");
  if (!rest) {
    return unknown(input, "memory content is required");
  }
  if (rest.startsWith("global ")) {
    const content = restAfter(rest, "global");
    return content
      ? { type: "memory.remember", scope: "global", content }
      : unknown(input, "memory content is required");
  }
  if (rest.startsWith("thread ")) {
    const content = restAfter(rest, "thread");
    return content
      ? { type: "memory.remember", scope: "thread", content }
      : unknown(input, "memory content is required");
  }
  return { type: "memory.remember", scope: "thread", content: rest };
}

function parseMemoryCommand(input: string): OperatorCommand {
  const rest = restAfter(input, "/memory");
  if (!rest) {
    return { type: "memory.list", scope: "active", query: null };
  }
  if (rest === "thread" || rest.startsWith("thread ")) {
    const query = restAfter(rest, "thread");
    return { type: "memory.list", scope: "thread", query: query || null };
  }
  if (rest === "global" || rest.startsWith("global ")) {
    const query = restAfter(rest, "global");
    return { type: "memory.list", scope: "global", query: query || null };
  }
  if (rest === "used") {
    return { type: "memory.used" };
  }
  return { type: "memory.list", scope: "active", query: rest };
}

export function parseOperatorCommand(input: string): OperatorCommand {
  const command = input.trim();
  if (command === "/help") {
    return { type: "help" };
  }
  if (command === "/exit" || command === "/quit") {
    return { type: "exit" };
  }
  if (command === "/status") {
    return { type: "status" };
  }
  if (command === "/new" || command.startsWith("/new ")) {
    const title = restAfter(command, "/new");
    return { type: "thread.new", title: title || null };
  }
  if (command === "/thread" || command.startsWith("/thread ")) {
    return parseThreadCommand(command);
  }
  if (command === "/objective") {
    return { type: "objective.show" };
  }
  if (command.startsWith("/objective ")) {
    const objective = restAfter(command, "/objective");
    return objective
      ? { type: "objective.set", objective }
      : unknown(command, "objective is required");
  }
  if (command === "/model" || command.startsWith("/model ")) {
    return parseModelCommand(command);
  }
  if (command === "/remember" || command.startsWith("/remember ")) {
    return parseRememberCommand(command);
  }
  if (command === "/memory-used") {
    return { type: "memory.used" };
  }
  if (command === "/memory" || command.startsWith("/memory ")) {
    return parseMemoryCommand(command);
  }
  if (command === "/forget" || command.startsWith("/forget ")) {
    const target = restAfter(command, "/forget");
    return target ? { type: "memory.forget", target } : unknown(command, "memory id is required");
  }
  if (command === "/context") {
    return { type: "context.preview" };
  }
  if (command === "/context full") {
    return { type: "context.full" };
  }
  if (command === "/compact") {
    return { type: "compact" };
  }
  if (command === "/summary") {
    return { type: "summary" };
  }
  if (command === "/prompts") {
    return { type: "prompts" };
  }
  return unknown(command);
}
