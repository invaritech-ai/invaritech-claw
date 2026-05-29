import type { OperatorStatus } from "../operator-api.js";

export type StatusView = {
  title: "Status";
  ok: boolean;
  lines: string[];
};

export function buildStatusView(status: OperatorStatus | null): StatusView {
  if (!status) {
    return {
      title: "Status",
      ok: false,
      lines: ["status unavailable"],
    };
  }
  const lines = [status.ok ? "ok" : "not ok"];
  if (typeof status.databasePath === "string") {
    lines.push(`db ${status.databasePath}`);
  }
  if (typeof status.serverTimeMs === "number") {
    lines.push(`server time ${status.serverTimeMs}`);
  }
  return {
    title: "Status",
    ok: status.ok,
    lines,
  };
}
