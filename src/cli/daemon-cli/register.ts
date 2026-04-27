import type { Command } from "commander";
import { formatCliDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { addGatewayServiceCommands } from "./register-service-commands.js";

export function registerDaemonCli(program: Command) {
  const daemon = program
    .command("daemon")
    .description("Manage the Gateway service (launchd/systemd/schtasks)")
    .addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatCliDocsLink("/cli/gateway")}\n`);

  addGatewayServiceCommands(daemon, {
    statusDescription: "Show service install status + probe connectivity/capability",
  });
}
