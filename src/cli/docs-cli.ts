import type { Command } from "commander";
import { docsSearchCommand } from "../commands/docs.js";
import { defaultRuntime } from "../runtime.js";
import { formatCliDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";

export function registerDocsCli(program: Command) {
  program
    .command("docs")
    .description("Search the iclaw documentation (remote index when configured)")
    .argument("[query...]", "Search query")
    .addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatCliDocsLink("/cli/docs")}\n`)
    .action(async (queryParts: string[]) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await docsSearchCommand(queryParts, defaultRuntime);
      });
    });
}
