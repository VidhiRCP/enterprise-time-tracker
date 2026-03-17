/**
 * Cross-window timer state synchronisation via BroadcastChannel.
 *
 * The MAIN window is the source of truth. It broadcasts state on every
 * meaningful change (start, pause, resume, save, discard, tick, project
 * change). The POPUP window listens and renders accordingly.
 *
 * The popup can send *commands* back to the main window (e.g. "pause",
 * "resume", "save", "start"). The main window executes the command and
 * then broadcasts the resulting state.
 */

export type TimerState = {
  /** null when idle */
  sessionId: string | null;
  projectId: string;
  projectName: string;
  status: "RUNNING" | "PAUSED" | "IDLE";
  /** Total accumulated seconds so far (frozen when paused) */
  accumulatedSeconds: number;
  /** ISO string – when the current running segment started (null when paused/idle) */
  lastResumedAt: string | null;
  notesDraft: string;
  /** Available projects for the popup's project picker */
  projects: { projectId: string; projectName: string }[];
};

export type TimerCommand =
  | { type: "start"; projectId: string; notes: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "save" }
  | { type: "discard" }
  | { type: "requestState" };

const CHANNEL_NAME = "rcp-timer-sync";

/* ── Helpers for the MAIN window ── */

let _mainChannel: BroadcastChannel | null = null;

export function getMainChannel(): BroadcastChannel {
  if (!_mainChannel) _mainChannel = new BroadcastChannel(CHANNEL_NAME);
  return _mainChannel;
}

export function broadcastTimerState(state: TimerState) {
  try {
    getMainChannel().postMessage({ kind: "state", payload: state });
  } catch {
    // channel may be closed
  }
}

export function onTimerCommand(handler: (cmd: TimerCommand) => void): () => void {
  const ch = getMainChannel();
  function listener(ev: MessageEvent) {
    if (ev.data?.kind === "command") handler(ev.data.payload as TimerCommand);
  }
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

/* ── Helpers for the POPUP window ── */

let _popupChannel: BroadcastChannel | null = null;

export function getPopupChannel(): BroadcastChannel {
  if (!_popupChannel) _popupChannel = new BroadcastChannel(CHANNEL_NAME);
  return _popupChannel;
}

export function sendTimerCommand(cmd: TimerCommand) {
  try {
    getPopupChannel().postMessage({ kind: "command", payload: cmd });
  } catch {
    // channel may be closed
  }
}

export function onTimerState(handler: (state: TimerState) => void): () => void {
  const ch = getPopupChannel();
  function listener(ev: MessageEvent) {
    if (ev.data?.kind === "state") handler(ev.data.payload as TimerState);
  }
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

/* ── Open popup helper ── */

let _popupWindow: Window | null = null;

export function openTimerPopup() {
  // If already open and not closed, just focus it
  if (_popupWindow && !_popupWindow.closed) {
    _popupWindow.focus();
    return _popupWindow;
  }

  const width = 340;
  const height = 280;
  const left = window.screen.availWidth - width - 24;
  const top = 24;

  _popupWindow = window.open(
    "/timer-popup",
    "rcp-timer-popup",
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`,
  );

  return _popupWindow;
}

export function closeTimerPopup() {
  if (_popupWindow && !_popupWindow.closed) {
    _popupWindow.close();
  }
  _popupWindow = null;
}

export function isTimerPopupOpen(): boolean {
  return !!_popupWindow && !_popupWindow.closed;
}
