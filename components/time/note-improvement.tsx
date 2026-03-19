"use client";

import { useEffect, useState } from "react";

export function NoteImprovement({
  note,
  projectId,
  onAccept,
  forceVisible,
  triggerKey = 0,
}: {
  note: string;
  projectId?: string | null;
  onAccept: (s: string) => void;
  forceVisible?: boolean;
  triggerKey?: number;
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);

  // triggerKey > 0 means the user explicitly clicked the generate icon
  const manualTriggered = triggerKey > 0;

  // Detection: short or vague notes — auto-prompt for these
  const vagueKeywords = ["meeting", "meet", "deck", "planning", "plan", "review", "call", "sync", "work"];
  const isVague = (() => {
    const t = note.trim();
    if (!t) return false;
    if (t.length <= 35) {
      const low = t.toLowerCase();
      if (vagueKeywords.includes(low) || low.split(/\s+/).length <= 3) return true;
    }
    return false;
  })();

  // Fetch a suggestion when auto-detected as vague OR manually triggered
  useEffect(() => {
    let cancelled = false;
    setSuggestion(null);
    setFailed(false);
    setDismissed(false);

    const hasText = note.trim().length > 0;
    if (!hasText) return;                       // nothing to rephrase
    if (!isVague && !manualTriggered) return;    // not vague + user didn't click icon

    const delay = isVague && !manualTriggered ? 2000 : 0;

    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/notes/improve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, projectId }),
        });
        if (!resp.ok) throw new Error('failed');
        const j = await resp.json();
        if (!cancelled) {
          setSuggestion(j.suggestion ?? null);
          if (!j.suggestion) setFailed(true);
        }
      } catch {
        if (!cancelled) { setSuggestion(null); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(id); };
  }, [note, projectId, triggerKey]);

  // Inline fetch for Regenerate / Retry
  async function fetchSuggestion() {
    setLoading(true);
    setFailed(false);
    try {
      const resp = await fetch('/api/notes/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, projectId }),
      });
      if (!resp.ok) throw new Error('failed');
      const j = await resp.json();
      setSuggestion(j.suggestion ?? null);
      if (!j.suggestion) setFailed(true);
    } catch {
      setSuggestion(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Visibility: show when auto-vague OR user clicked icon, and not dismissed
  const visible = (isVague || manualTriggered) && !dismissed;
  // Keep the panel visible even when suggestion is null (show "no suggestion" + retry)
  if (!visible || (!suggestion && !loading && !failed)) return null;

  return (
    <div className="mt-2 flex items-start gap-3 px-3 py-2 border border-[#808080]/20 bg-[#0f0f0f] rounded">
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="text-xs text-[#808080] flex items-center gap-2">
            <div className="inline-block h-4 w-4 animate-spin border-2 border-[#808080]/30 border-t-[#F40000]" /> Improving…
          </div>
        ) : suggestion ? (
          <div className="text-sm text-[#D9D9D9]">{suggestion}</div>
        ) : (
          <div className="text-xs text-[#808080]">Couldn't rephrase — try again.</div>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {suggestion && (
          <button
            type="button"
            onClick={() => onAccept(suggestion)}
            className="border border-[#F40000]/40 px-2 py-1 text-xs font-bold text-[#F8F8F8] hover:bg-[#F40000]/20"
          >
            Accept
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={fetchSuggestion}
          className="border border-[#808080]/30 px-2 py-1 text-xs text-[#808080] hover:text-[#D9D9D9]"
        >
          {suggestion ? "Regenerate" : "Retry"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="border border-[#808080]/30 px-2 py-1 text-xs text-[#808080] hover:text-[#D9D9D9]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
