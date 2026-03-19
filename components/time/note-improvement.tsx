"use client";

import { useEffect, useState } from "react";

export function NoteImprovement({
  note,
  projectId,
  onAccept,
  forceVisible,
  triggerKey,
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

  // Detection: short or vague notes — length < 35 or single-word common placeholders
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
  useEffect(() => {
    let cancelled = false;
    setSuggestion(null);
    setDismissed(false);

    const manualRequested = (triggerKey !== undefined && triggerKey !== null) || !!forceVisible;
    if (!isVague && !manualRequested) return;

    const delay = isVague && !manualRequested ? 2000 : 0;

    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/notes/improve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, projectId }) });
        if (!resp.ok) throw new Error('failed');
        const j = await resp.json();
        if (!cancelled) setSuggestion(j.suggestion ?? null);
      } catch (e) {
        if (!cancelled) setSuggestion(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(id); };
  }, [note, projectId, triggerKey, forceVisible]);

  const visible = (isVague || !!forceVisible || (triggerKey !== undefined && triggerKey !== null)) && !dismissed;
  if (!visible || (!suggestion && !loading)) return null;

  return (
    <div className="mt-2 flex items-start gap-3 px-3 py-2 border border-[#808080]/20 bg-[#0f0f0f] rounded">
      <div className="flex-1">
        {loading ? (
          <div className="text-xs text-[#808080] flex items-center gap-2">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#808080]/30 border-t-[#F40000]" /> Generating suggestion…
          </div>
        ) : suggestion ? (
          <div className="text-sm text-[#D9D9D9]">{suggestion}</div>
        ) : (
          <div className="text-xs text-[#808080]">No suggestion available.</div>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          type="button"
          disabled={!suggestion}
          onClick={() => { if (suggestion) onAccept(suggestion); }}
          className="border border-[#F40000]/40 px-2 py-1 text-xs font-bold text-[#F8F8F8] hover:bg-[#F40000]/20"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const resp = await fetch('/api/notes/improve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, projectId }) });
              if (!resp.ok) throw new Error('failed');
              const j = await resp.json();
              setSuggestion(j.suggestion ?? null);
            } catch (e) {
              setSuggestion(null);
            } finally {
              setLoading(false);
            }
          }}
          className="border border-[#808080]/30 px-2 py-1 text-xs text-[#808080] hover:text-[#D9D9D9]"
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="border border-[#808080]/30 px-2 py-1 text-xs text-[#808080] hover:text-[#D9D9D9]"
        >
          Ignore
        </button>
      </div>
    </div>
  );
}
