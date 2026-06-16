import { describe, expect, it } from "vitest";
import { parseOperatorCommand } from "../../src/tui/commands.js";

describe("parseOperatorCommand", () => {
  it("parses general commands", () => {
    expect(parseOperatorCommand("/help")).toEqual({ type: "help" });
    expect(parseOperatorCommand("/exit")).toEqual({ type: "exit" });
    expect(parseOperatorCommand("/quit")).toEqual({ type: "exit" });
    expect(parseOperatorCommand("/status")).toEqual({ type: "status" });
  });

  it("parses thread commands", () => {
    expect(parseOperatorCommand("/new Build memory")).toEqual({
      type: "thread.new",
      title: "Build memory",
    });
    expect(parseOperatorCommand("/thread list")).toEqual({ type: "thread.list" });
    expect(parseOperatorCommand("/thread switch abc123")).toEqual({
      type: "thread.switch",
      target: "abc123",
    });
    expect(parseOperatorCommand("/thread rename New title")).toEqual({
      type: "thread.rename",
      title: "New title",
    });
    expect(parseOperatorCommand("/thread archive abc123")).toEqual({
      type: "thread.archive",
      target: "abc123",
    });
    expect(parseOperatorCommand("/thread archive")).toEqual({
      type: "thread.archive",
      target: null,
    });
  });

  it("parses objective and model commands", () => {
    expect(parseOperatorCommand("/objective")).toEqual({ type: "objective.show" });
    expect(parseOperatorCommand("/objective Ship Milestone A")).toEqual({
      type: "objective.set",
      objective: "Ship Milestone A",
    });
    expect(parseOperatorCommand("/model")).toEqual({ type: "model.show" });
    expect(parseOperatorCommand("/model list")).toEqual({ type: "model.list" });
    expect(parseOperatorCommand("/model set ollama/gemma4:e4b")).toEqual({
      type: "model.set",
      modelRef: "ollama/gemma4:e4b",
    });
  });

  it("parses memory commands", () => {
    expect(parseOperatorCommand("/remember The current plan is thread-first.")).toEqual({
      type: "memory.remember",
      scope: "thread",
      content: "The current plan is thread-first.",
    });
    expect(parseOperatorCommand("/remember global User prefers manual switching.")).toEqual({
      type: "memory.remember",
      scope: "global",
      content: "User prefers manual switching.",
    });
    expect(parseOperatorCommand("/memory")).toEqual({
      type: "memory.list",
      scope: "active",
      query: null,
    });
    expect(parseOperatorCommand("/memory thread provider")).toEqual({
      type: "memory.list",
      scope: "thread",
      query: "provider",
    });
    expect(parseOperatorCommand("/memory global")).toEqual({
      type: "memory.list",
      scope: "global",
      query: null,
    });
    expect(parseOperatorCommand("/memory-used")).toEqual({ type: "memory.used" });
    expect(parseOperatorCommand("/forget a8f13c")).toEqual({
      type: "memory.forget",
      target: "a8f13c",
    });
  });

  it("parses context and compaction commands", () => {
    expect(parseOperatorCommand("/context")).toEqual({ type: "context.preview" });
    expect(parseOperatorCommand("/context full")).toEqual({ type: "context.full" });
    expect(parseOperatorCommand("/compact")).toEqual({ type: "compact" });
    expect(parseOperatorCommand("/summary")).toEqual({ type: "summary" });
    expect(parseOperatorCommand("/prompts")).toEqual({ type: "prompts" });
  });

  it("returns unknown for malformed commands", () => {
    expect(parseOperatorCommand("/thread")).toEqual({
      type: "unknown",
      input: "/thread",
      message: "unknown command: /thread",
    });
    expect(parseOperatorCommand("/model set")).toEqual({
      type: "unknown",
      input: "/model set",
      message: "model ref is required",
    });
  });
});
