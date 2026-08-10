import { describe, expect, it } from "vitest";
import { addOsc8Hyperlinks, extractUrls } from "../../src/tui/osc8-hyperlinks.js";

describe("OSC 8 hyperlinks", () => {
  it("extracts markdown and bare URLs in first-seen order", () => {
    expect(
      extractUrls("Read [docs](https://example.com/docs) and visit https://example.com/status."),
    ).toEqual(["https://example.com/docs", "https://example.com/status."]);
  });

  it("wraps visible URL fragments with OSC 8 terminal links", () => {
    const [line] = addOsc8Hyperlinks(
      ["status: https://example.com/status"],
      ["https://example.com/status"],
    );

    expect(line).toContain(
      "\u001b]8;;https://example.com/status\u0007https://example.com/status\u001b]8;;\u0007",
    );
  });
});
