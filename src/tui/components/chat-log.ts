import type { Component } from "@mariozechner/pi-tui";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { theme } from "../theme/theme.js";
import { AssistantMessageComponent } from "./assistant-message.js";
import { UserMessageComponent } from "./user-message.js";

export class ChatLog extends Container {
  private readonly maxComponents: number;

  constructor(maxComponents = 180) {
    super();
    this.maxComponents = Math.max(20, Math.floor(maxComponents));
  }

  private pruneOverflow(): void {
    while (this.children.length > this.maxComponents) {
      const oldest = this.children[0];
      if (!oldest) {
        return;
      }
      this.removeChild(oldest);
    }
  }

  private append(component: Component): void {
    this.addChild(component);
    this.pruneOverflow();
  }

  clearAll(): void {
    this.clear();
  }

  addSystem(text: string): void {
    const entry = new Container();
    entry.addChild(new Spacer(1));
    entry.addChild(new Text(theme.system(text), 1, 0));
    this.append(entry);
  }

  addUser(text: string): void {
    this.append(new UserMessageComponent(text));
  }

  addAssistant(text: string): void {
    this.append(new AssistantMessageComponent(text));
  }
}
