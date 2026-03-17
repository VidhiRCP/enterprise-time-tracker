"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  sendTimerCommand,
  onTimerState,
  getPopupChannel,
  type TimerState,
} from "@/lib/timer-broadcast";

function formatSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const IDLE_STATE: TimerState = {
  sessionId: null,
  projectId: "",
  projectName: "",
  status: "IDLE",
  accumulatedSeconds: 0,
  lastResumedAt: null,
  notesDraft: "",
  projects: [],
};

export default function TimerPopupPage() {
  const [state, setState] = useState<TimerState>(IDLE_STATE);
  const [tick, setTick] = useState(0);
  const [selectedProject, setSelectedProject] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Listen for state from main window
  useEffect(() => {
    const unsub = onTimerState((s) => {
      setState(s);
      if (!selectedProject && s.projectId) {
        setSelectedProject(s.projectId);
      }
    });

    // Request current state on mount
    sendTimerCommand({ type: "requestState" });

    return unsub;
  }, []);

  // Update selectedProject when state changes
  useEffect(() => {
    if (state.projectId && state.status !== "IDLE") {
      setSelectedProject(state.projectId);
    }
  }, [state.projectId, state.status]);

  // Tick every second for live elapsed display
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Compute live elapsed
  const elapsed = useMemo(() => {
    void tick;
    if (state.status === "IDLE") return 0;
    if (state.status === "PAUSED") return state.accumulatedSeconds;
    // RUNNING
    const resumed = state.lastResumedAt
      ? new Date(state.lastResumedAt).getTime()
      : Date.now();
    return state.accumulatedSeconds + Math.floor((Date.now() - resumed) / 1000);
  }, [state, tick]);

  const isIdle = state.status === "IDLE";
  const isRunning = state.status === "RUNNING";
  const isPaused = state.status === "PAUSED";
  const hasSession = !isIdle;

  const effectiveProject = selectedProject || state.projects[0]?.projectId || "";
  const projectName =
    state.projects.find((p) => p.projectId === (hasSession ? state.projectId : effectiveProject))
      ?.projectName ?? "—";

  const handleStart = useCallback(() => {
    if (!effectiveProject) return;
    sendTimerCommand({ type: "start", projectId: effectiveProject, notes: "" });
  }, [effectiveProject]);

  const handlePause = useCallback(() => sendTimerCommand({ type: "pause" }), []);
  const handleResume = useCallback(() => sendTimerCommand({ type: "resume" }), []);
  const handleSave = useCallback(() => sendTimerCommand({ type: "save" }), []);
  const handleDiscard = useCallback(() => {
    if (confirm("Discard this session?")) sendTimerCommand({ type: "discard" });
  }, []);

  // Status colour
  const statusColor = isRunning
    ? "#F40000"
    : isPaused
      ? "#808080"
      : "#333";

  return (
    <div
      className="select-none"
      style={{
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        background: "#000",
        color: "#F8F8F8",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Title bar (draggable) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(128,128,128,0.2)",
          cursor: "default",
          userSelect: "none",
        } as React.CSSProperties}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#808080", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          RCP Timer
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 0,
              background: statusColor,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 10, color: "#808080" }}>
            {isRunning ? "Running" : isPaused ? "Paused" : "Idle"}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, padding: "16px 16px 12px" }}>
        {/* Project name */}
        <div style={{ fontSize: 12, color: "#D9D9D9", marginBottom: 4, fontWeight: 600 }}>
          {hasSession ? projectName : "No active timer"}
        </div>

        {/* Timer display */}
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            color: isRunning ? "#F8F8F8" : isPaused ? "#D9D9D9" : "#333",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          {formatSeconds(elapsed)}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isIdle && (
            <>
              {/* Project selector */}
              <select
                value={effectiveProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "#0a0a0a",
                  border: "1px solid rgba(128,128,128,0.3)",
                  color: "#D9D9D9",
                  fontSize: 11,
                  padding: "6px 8px",
                  outline: "none",
                }}
              >
                {state.projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName}
                  </option>
                ))}
                {state.projects.length === 0 && (
                  <option value="">No projects</option>
                )}
              </select>
              <button onClick={handleStart} disabled={!effectiveProject} style={btnStyle("#F40000", "#fff")}>
                ▶ Start
              </button>
            </>
          )}

          {isRunning && (
            <>
              <button onClick={handlePause} style={btnStyle("transparent", "#D9D9D9", true)}>
                ⏸ Pause
              </button>
              <button onClick={handleSave} style={btnStyle("transparent", "#D9D9D9", true)}>
                💾 Save
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button onClick={handleResume} style={btnStyle("#F40000", "#fff")}>
                ▶ Resume
              </button>
              <button onClick={handleSave} style={btnStyle("transparent", "#D9D9D9", true)}>
                💾 Save
              </button>
              <button onClick={handleDiscard} style={btnStyle("transparent", "#808080", true)}>
                ✕
              </button>
            </>
          )}
        </div>

        {/* Project switcher when session active */}
        {hasSession && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <select
              value={state.projectId}
              disabled
              style={{
                flex: 1,
                minWidth: 0,
                background: "#0a0a0a",
                border: "1px solid rgba(128,128,128,0.15)",
                color: "#808080",
                fontSize: 10,
                padding: "4px 6px",
                outline: "none",
              }}
            >
              {state.projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Button style helper ── */
function btnStyle(
  bg: string,
  color: string,
  ghost = false,
): React.CSSProperties {
  return {
    background: ghost ? "transparent" : bg,
    color,
    border: ghost ? "1px solid rgba(128,128,128,0.3)" : "none",
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  };
}
