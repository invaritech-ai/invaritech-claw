import type { Component, DefaultTextStyle, MarkdownTheme } from "@mariozechner/pi-tui";
import { Markdown } from "@mariozechner/pi-tui";
import { addOsc8Hyperlinks, extractUrls } from "../osc8-hyperlinks.js";

export class HyperlinkMarkdown implements Component {
  private inner: Markdown;
  private urls: string[];

  constructor(
    text: string,
    paddingX: number,
    paddingY: number,
    markdownTheme: MarkdownTheme,
    options?: DefaultTextStyle,
  ) {
    this.inner = new Markdown(text, paddingX, paddingY, markdownTheme, options);
    this.urls = extractUrls(text);
  }

  render(width: number): string[] {
    return addOsc8Hyperlinks(this.inner.render(width), this.urls);
  }

  setText(text: string): void {
    this.inner.setText(text);
    this.urls = extractUrls(text);
  }

  invalidate(): void {
    this.inner.invalidate();
  }
}
