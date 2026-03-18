/**
 * Work-pattern learning – captures behavioural signals on confirmed saves
 * and exposes them for project-suggestion scoring.
 *
 * Signal types:
 *   'note'     – extracted keywords from time-entry notes
 *   'meeting'  – normalised meeting subject words
 *   'merchant' – normalised merchant name from expense entries
 */

import { prisma } from "@/lib/prisma";

/* ── Noise words removed during normalisation ── */
const NOISE = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "been", "has", "had", "will", "do", "did", "not", "this", "that",
  "all", "my", "we", "our", "i", "me", "up", "so", "no", "if",
  "re", "fw", "fwd", "meeting", "call", "sync", "weekly", "daily",
  "bi-weekly", "standup", "stand-up", "check-in",
]);

/* ── Helpers ── */

/** Lower-case, strip non-alphanumeric, remove noise words, sort, dedupe */
export function normaliseSignal(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w));
  return [...new Set(words)].sort().join(" ");
}

/**
 * Extract multiple signal values from a text.
 * For notes / meeting subjects we extract individual keywords (≥3 chars, not noise)
 * so each keyword is tracked independently.
 */
function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w));
  return [...new Set(words)];
}

/* ── Confidence decay / growth constants ── */
const CONFIDENCE_INCREMENT = 0.15;
const CONFIDENCE_MAX = 1.0;
const CONFIDENCE_INITIAL = 0.2;

/* ── Public API ── */

/**
 * Capture a behavioural signal after a confirmed save.
 * Upserts one row per (user, signalType, keyword, project) tuple.
 *
 * For 'note' and 'meeting' types the value is split into keywords and each
 * keyword is upserted individually so patterns emerge per word.
 * For 'merchant' the full normalised name is used as-is.
 */
export async function captureSignal(
  email: string,
  signalType: "note" | "meeting" | "merchant",
  rawValue: string,
  projectId: string,
): Promise<void> {
  if (!rawValue.trim()) return;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;

  const keywords =
    signalType === "merchant"
      ? [normaliseSignal(rawValue)] // keep full merchant as single value
      : extractKeywords(rawValue);

  if (keywords.length === 0) return;

  const now = new Date();

  // Fire-and-forget upserts – don't block the caller
  await Promise.allSettled(
    keywords.map((kw) =>
      prisma.userWorkPattern.upsert({
        where: {
          userId_signalType_signalValue_projectId: {
            userId: user.id,
            signalType,
            signalValue: kw,
            projectId,
          },
        },
        update: {
          count: { increment: 1 },
          confidenceScore: {
            // Prisma doesn't support min() in update, so we clamp server-side
            increment: CONFIDENCE_INCREMENT,
          },
          lastUsedAt: now,
        },
        create: {
          userId: user.id,
          signalType,
          signalValue: kw,
          projectId,
          count: 1,
          confidenceScore: CONFIDENCE_INITIAL,
          lastUsedAt: now,
        },
      }).then(async (row) => {
        // Clamp confidence to max
        if (row.confidenceScore > CONFIDENCE_MAX) {
          await prisma.userWorkPattern.update({
            where: { id: row.id },
            data: { confidenceScore: CONFIDENCE_MAX },
          });
        }
      }),
    ),
  );
}

export type WorkPattern = {
  signalType: string;
  signalValue: string;
  projectId: string;
  confidenceScore: number;
  count: number;
};

/**
 * Query stored work patterns for a user.
 * If signalType is provided, filters to that type.
 * Returns patterns sorted by confidence descending.
 */
export async function queryPatterns(
  email: string,
  signalType?: "note" | "meeting" | "merchant",
): Promise<WorkPattern[]> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return [];

  const rows = await prisma.userWorkPattern.findMany({
    where: {
      userId: user.id,
      ...(signalType ? { signalType } : {}),
    },
    select: {
      signalType: true,
      signalValue: true,
      projectId: true,
      confidenceScore: true,
      count: true,
    },
    orderBy: { confidenceScore: "desc" },
  });

  return rows;
}

/**
 * Score a text against stored patterns for a given signal type.
 * Returns a map of projectId → aggregated confidence score.
 *
 * Confidence thresholds (applied by consumer):
 *   ≥ 0.7  → auto-select
 *   0.4–0.7 → show suggestion
 *   < 0.4  → ignore
 */
export function scoreTextAgainstPatterns(
  text: string,
  patterns: WorkPattern[],
  signalType: "note" | "meeting" | "merchant",
): Map<string, number> {
  const scores = new Map<string, number>();

  if (!text.trim() || patterns.length === 0) return scores;

  const filteredPatterns = patterns.filter((p) => p.signalType === signalType);

  if (signalType === "merchant") {
    // For merchants, match full normalised value
    const normalised = normaliseSignal(text);
    for (const p of filteredPatterns) {
      if (p.signalValue === normalised) {
        scores.set(p.projectId, Math.max(scores.get(p.projectId) ?? 0, p.confidenceScore));
      }
    }
  } else {
    // For note / meeting, extract keywords and check overlap
    const keywords = extractKeywords(text);
    for (const kw of keywords) {
      for (const p of filteredPatterns) {
        if (p.signalValue === kw) {
          const current = scores.get(p.projectId) ?? 0;
          // Accumulate but cap at CONFIDENCE_MAX
          scores.set(p.projectId, Math.min(CONFIDENCE_MAX, current + p.confidenceScore * 0.5));
        }
      }
    }
  }

  return scores;
}
