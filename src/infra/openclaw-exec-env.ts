export const ICLAW_CLI_ENV_VAR = "ICLAW_CLI";
export const ICLAW_CLI_ENV_VALUE = "1";

export function markOpenClawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [ICLAW_CLI_ENV_VAR]: ICLAW_CLI_ENV_VALUE,
  };
}

export function ensureOpenClawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[ICLAW_CLI_ENV_VAR] = ICLAW_CLI_ENV_VALUE;
  return env;
}
