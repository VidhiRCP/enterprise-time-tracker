"use client";

import { useMemo, useState, useCallback } from "react";

/* ── Types ── */
export type SuggestionProject = {
  projectId: string;
  projectName: string;
};

export type SuggestionAssignment = {
  projectId: string;
  projectName: string;
  aliases: string; // comma-separated keywords
};

export type SuggestionEntry = {
  projectId: string;
  notes: string | null;
};

/** Learned work-pattern row (from UserWorkPattern table) */
export type SuggestionWorkPattern = {
  signalType: string;
  signalValue: string;
  projectId: string;
  confidenceScore: number;
  count: number;
};

export type ProjectSuggestionResult = {
  projectId: string;
  projectName: string;
  confidence: "high" | "medium" | "low";
  score: number;
  matchReason: string;
} | null;

/* ── Scoring constants ── */
const PATTERN_HIGH_CONFIDENCE_SCORE = 70;   // pattern confidence ≥ 0.7
const PATTERN_MEDIUM_CONFIDENCE_SCORE = 40; // pattern confidence 0.4–0.7
const PATTERN_CONFIDENCE_HIGH = 0.7;
const PATTERN_CONFIDENCE_MEDIUM = 0.4;

const ALIAS_BASE = 30;
const ALIAS_LENGTH_BONUS_PER_CHAR = 2;
const ALIAS_LENGTH_BONUS_CAP = 20;
const RECENT_USAGE_PER_ENTRY = 3;
const RECENT_USAGE_CAP = 25;
const NOTE_WORD_MATCH_PER_HIT = 4;
const NOTE_WORD_MATCH_CAP = 25;

const HIGH_THRESHOLD = 40;
const MEDIUM_THRESHOLD = 20;
const MIN_DISPLAY_THRESHOLD = 10;

/* Stopwords to ignore during text matching */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "been", "has", "had", "will", "do", "did", "not", "this", "that",
  "all", "my", "we", "our", "i", "me", "up", "so", "no", "if",
]);

/* ── Scoring function ── */
function scoreProject(
  notesText: string,
  assignment: SuggestionAssignment,
  recentEntries: SuggestionEntry[],
  workPatterns: SuggestionWorkPattern[],
): { score: number; reason: string } {
  const lower = notesText.toLowerCase().trim();
  if (!lower) return { score: 0, reason: "" };

  let score = 0;
  const reasons: string[] = [];

  /* 0. Learned work-pattern matching — highest priority signal */
  const inputKeywords = lower
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const projectPatterns = workPatterns.filter(
    (p) => p.projectId === assignment.projectId && p.signalType === "note",
  );

  if (projectPatterns.length > 0 && inputKeywords.length > 0) {
    // Find the best matching pattern confidence for this project
    let bestConfidence = 0;
    let matchedKeyword = "";
    for (const kw of inputKeywords) {
      for (const p of projectPatterns) {
        if (p.signalValue === kw && p.confidenceScore > bestConfidence) {
          bestConfidence = p.confidenceScore;
          matchedKeyword = kw;
        }
      }
    }

    if (bestConfidence >= PATTERN_CONFIDENCE_HIGH) {
      score += PATTERN_HIGH_CONFIDENCE_SCORE;
      reasons.push(`learned pattern "${matchedKeyword}"`);
    } else if (bestConfidence >= PATTERN_CONFIDENCE_MEDIUM) {
      score += PATTERN_MEDIUM_CONFIDENCE_SCORE;
      reasons.push(`learned pattern "${matchedKeyword}"`);
    }
    // < 0.4 → ignore
  }

  /* 1. Alias keyword matching — highest signal */
  const aliasKeywords = assignment.aliases
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  // Sort by length descending — match longest keyword first
  aliasKeywords.sort((a, b) => b.length - a.length);

  let aliasMatched = false;
  for (const kw of aliasKeywords) {
    if (lower.includes(kw)) {
      const bonus = ALIAS_BASE + Math.min(ALIAS_LENGTH_BONUS_CAP, kw.length * ALIAS_LENGTH_BONUS_PER_CHAR);
      score += bonus;
      reasons.push(`alias "${kw}"`);
      aliasMatched = true;
      break; // Only count the best alias match
    }
  }

  /* 2. Recent usage frequency */
  const projectEntries = recentEntries.filter((e) => e.projectId === assignment.projectId);
  if (projectEntries.length > 0) {
    const recencyScore = Math.min(RECENT_USAGE_CAP, projectEntries.length * RECENT_USAGE_PER_ENTRY);
    score += recencyScore;
    if (!aliasMatched && recencyScore >= 10) {
      reasons.push("recent usage");
    }
  }

  /* 3. Notes text similarity — word overlap with past entries */
  if (inputKeywords.length > 0) {
    // Build a word set from all past notes for this project
    const pastWords = new Set<string>();
    for (const entry of projectEntries) {
      if (entry.notes) {
        for (const w of entry.notes.toLowerCase().split(/[\s,.\-/;:!?()]+/)) {
          if (w.length >= 3 && !STOPWORDS.has(w)) pastWords.add(w);
        }
      }
    }

    let matchCount = 0;
    for (const word of inputKeywords) {
      if (pastWords.has(word)) matchCount++;
    }

    if (matchCount > 0) {
      const simScore = Math.min(NOTE_WORD_MATCH_CAP, matchCount * NOTE_WORD_MATCH_PER_HIT);
      score += simScore;
      if (!aliasMatched && simScore >= 8) {
        reasons.push("similar notes");
      }
    }
  }

  /* 4. Project name substring match — secondary signal */
  const projNameLower = assignment.projectName.toLowerCase();
  for (const word of inputKeywords) {
    if (word.length >= 4 && projNameLower.includes(word)) {
      score += 15;
      reasons.push("project name");
      break;
    }
  }

  const reason = reasons.length > 0 ? `Matched: ${reasons.join(", ")}` : "";
  return { score, reason };
}

/* ── Hook ── */
export function useProjectSuggestion({
  notes,
  assignments,
  recentEntries,
  workPatterns = [],
  currentProjectId,
  enabled = true,
}: {
  notes: string;
  assignments: SuggestionAssignment[];
  recentEntries: SuggestionEntry[];
  workPatterns?: SuggestionWorkPattern[];
  currentProjectId: string;
  enabled?: boolean;
}): {
  suggestion: ProjectSuggestionResult;
  dismissed: boolean;
  dismiss: () => void;
  resetDismiss: () => void;
} {
  const [dismissedFor, setDismissedFor] = useState<string>("");

  const suggestion = useMemo((): ProjectSuggestionResult => {
    if (!enabled || !notes.trim() || assignments.length === 0) return null;

    let best: { projectId: string; projectName: string; score: number; reason: string } | null = null;

    for (const assignment of assignments) {
      const { score, reason } = scoreProject(notes, assignment, recentEntries, workPatterns);
      if (score > (best?.score ?? 0)) {
        best = {
          projectId: assignment.projectId,
          projectName: assignment.projectName,
          score,
          reason,
        };
      }
    }

    if (!best || best.score < MIN_DISPLAY_THRESHOLD) return null;

    // Don't suggest the already-selected project
    if (best.projectId === currentProjectId) return null;

    const confidence: "high" | "medium" | "low" =
      best.score >= HIGH_THRESHOLD ? "high" : best.score >= MEDIUM_THRESHOLD ? "medium" : "low";

    return {
      projectId: best.projectId,
      projectName: best.projectName,
      confidence,
      score: best.score,
      matchReason: best.reason,
    };
  }, [notes, assignments, recentEntries, workPatterns, currentProjectId, enabled]);

  // Track dismissal — dismissed for a specific suggestion
  const dismissed = dismissedFor !== "" && suggestion?.projectId === dismissedFor;

  const dismiss = useCallback(() => {
    if (suggestion) setDismissedFor(suggestion.projectId);
  }, [suggestion]);

  const resetDismiss = useCallback(() => {
    setDismissedFor("");
  }, []);

  return { suggestion: dismissed ? null : suggestion, dismissed, dismiss, resetDismiss };
}
