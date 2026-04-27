import type { Command } from "commander";
import { formatCliDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { registerQrCli } from "./qr-cli.js";

export function registerClawbotCli(program: Command) {
  const clawbot = program
    .command("clawbot")
    .description("Legacy clawbot command aliases")
    .addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatCliDocsLink("/cli/clawbot")}\n`);
  registerQrCli(clawbot);
}
