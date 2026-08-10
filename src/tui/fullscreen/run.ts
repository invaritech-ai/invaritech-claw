import { Container, ProcessTerminal, Text, TUI } from "@mariozechner/pi-tui";
import { ChatLog } from "../components/chat-log.js";
import { CustomEditor } from "../components/custom-editor.js";
import type { NativeOperatorApiClient } from "../operator-api.js";
import { editorTheme, theme } from "../theme/theme.js";
import {
  beginFullscreenCommand,
  initializeFullscreenTuiState,
  runFullscreenCommand,
  submitFullscreenPrompt,
  type FullscreenTuiState,
} from "./state.js";
import {
  formatFullscreenFooter,
  formatFullscreenHeader,
  formatFullscreenStatus,
  syncFullscreenChatLog,
} from "./view.js";

function isIgnorableTuiStopError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: unknown; syscall?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const syscall = typeof record.syscall === "string" ? record.syscall : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "EBADF" && syscall === "setRawMode") ||
    (/setRawMode/i.test(message) && /EBADF/i.test(message))
  );
}

function stopTuiSafely(tui: TUI): void {
  try {
    tui.stop();
  } catch (error) {
    if (!isIgnorableTuiStopError(error)) {
      throw error;
    }
  }
}

export async function runFullscreenOperatorConsole(input: {
  agentId: string;
  baseUrl: string;
  client: NativeOperatorApiClient;
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
}): Promise<void> {
  let state = await initializeFullscreenTuiState({
    agentId: input.agentId,
    serverUrl: input.baseUrl,
    client: input.client,
  });
  const tui = new TUI(new ProcessTerminal());
  const root = new Container();
  const header = new Text("", 1, 0);
  const chatLog = new ChatLog();
  const status = new Text("", 1, 0);
  const footer = new Text("", 1, 0);
  const editor = new CustomEditor(tui, editorTheme);
  let busy = false;
  let finished = false;

  root.addChild(header);
  root.addChild(chatLog);
  root.addChild(status);
  root.addChild(footer);
  root.addChild(editor);
  tui.addChild(root);
  tui.setFocus(editor);

  const renderState = (nextState: FullscreenTuiState): void => {
    state = nextState;
    header.setText(theme.header(formatFullscreenHeader(state)));
    syncFullscreenChatLog(chatLog, state);
    status.setText(theme.dim(formatFullscreenStatus(state)));
    footer.setText(theme.dim(formatFullscreenFooter(state)));
    tui.requestRender();
  };

  const requestExit = (resolve: () => void): void => {
    if (finished) {
      return;
    }
    finished = true;
    void tui.terminal
      .drainInput()
      .catch(() => undefined)
      .finally(() => {
        stopTuiSafely(tui);
        resolve();
      });
  };

  await new Promise<void>((resolve) => {
    const submit = async (raw: string): Promise<void> => {
      const value = raw.trim();
      if (value.length === 0 || busy || finished) {
        return;
      }
      busy = true;
      try {
        if (value.startsWith("/")) {
          const pending = beginFullscreenCommand(state, value);
          renderState(pending);
          const next = await runFullscreenCommand({
            state: pending,
            client: input.client,
            command: value,
          });
          renderState(next);
          if (next.shouldExit) {
            requestExit(resolve);
          }
          return;
        }
        const next = await submitFullscreenPrompt({
          state,
          client: input.client,
          content: value,
          onState: renderState,
        });
        renderState(next);
      } finally {
        busy = false;
      }
    };

    editor.onSubmit = (value) => {
      void submit(value);
    };
    editor.onEscape = () => {
      renderState({ ...state, panel: null, detail: null, lastError: null });
    };
    editor.onCtrlC = () => {
      requestExit(resolve);
    };
    editor.onCtrlD = () => {
      requestExit(resolve);
    };

    renderState(state);
    tui.start();
  });
}
