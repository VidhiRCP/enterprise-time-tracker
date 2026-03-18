import { NextResponse } from 'next/server';
import { getWeeklyMetrics, type WeeklyMetrics } from '@/lib/insights';
import { auth } from '@/auth';

async function requireEmail() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session.user.email.toLowerCase();
}

export interface StructuredInsights {
  highlights: string[];
  warnings: string[];
  trends: string[];
}

export async function POST(req: Request) {
  try {
    const email = await requireEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const weekStart = body?.weekStart;
    if (!weekStart) return NextResponse.json({ error: 'weekStart required' }, { status: 400 });

    const metrics = await getWeeklyMetrics(email, weekStart);

    // If there's no activity at all, return empty
    if ((metrics.totalMinutes ?? 0) === 0 && (!metrics.expenseSummary || metrics.expenseSummary.count === 0)) {
      return NextResponse.json({ insights: null, metrics });
    }

    // Build payload with all new metric fields
    const payload = {
      weekStart: metrics.weekStart,
      weekEnd: metrics.weekEnd,
      totalMinutes: metrics.totalMinutes,
      totalActivityMinutes: metrics.totalActivityMinutes,
      totalMeetingMinutes: metrics.totalMeetingMinutes,
      coveragePercent: metrics.coveragePercent,
      estimatedUntrackedMinutes: metrics.estimatedUntrackedMinutes,
      projectTotals: metrics.projectTotals.map((p) => ({ projectId: p.projectId, projectName: p.projectName, minutes: p.minutes })),
      meetingMinutes: metrics.meetingMinutes,
      meetingMinutesPrevWeek: metrics.meetingMinutesPrevWeek,
      zeroActivityDays: metrics.zeroActivityDays,
      lowActivityDays: metrics.lowActivityDays,
      inactiveProjects: metrics.inactiveProjects,
      expenseSummary: metrics.expenseSummary,
      assignedProjectCount: metrics.assignedProjectCount,
      activeDays: metrics.activeDays,
      overlapTotalMinutes: metrics.overlapTotalMinutes,
      overlapCount: metrics.overlapCount,
      overlapAffectedDays: metrics.overlapAffectedDays,
      prevWeekTotalMinutes: metrics.prevWeekTotalMinutes,
    };

    // Call OpenAI Responses API
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ insights: generateFallbackInsights(metrics), metrics: payload });
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const system = `You are an assistant that generates structured weekly insights for project managers. Given the metrics, return a JSON object with exactly three arrays:

{
  "highlights": ["...", "..."],
  "warnings": ["...", "..."],
  "trends": ["...", "..."]
}

Rules:
- highlights: 3-5 key positive facts (short, scannable bullets)
- warnings: 2-4 attention areas (issues, gaps, risks)
- trends: 2-3 trend observations (week-over-week changes, patterns)
- Each item is a single concise sentence (max 15 words)
- Use specific numbers (hours, %, project names)
- Mention overlap/double-booked time if overlapCount > 0
- Mention untracked time and coverage %
- Compare with previous week if prevWeekTotalMinutes is available
- Do not invent facts; only use the provided metrics
- Return ONLY valid JSON, no markdown fences`;

    const userContent = `Metrics: ${JSON.stringify(payload)}`;

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model, input: [{ role: 'user', content: [{ type: 'input_text', text: system }, { type: 'input_text', text: userContent }] }], max_output_tokens: 500 }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('OpenAI error:', txt);
      return NextResponse.json({ insights: generateFallbackInsights(metrics), metrics: payload });
    }

    const data = await resp.json();

    // Extract textual output
    let rawText = '';
    try {
      if (Array.isArray(data.output)) {
        for (const out of data.output) {
          if (!out || !Array.isArray(out.content)) continue;
          for (const c of out.content) {
            if (c && typeof c.text === 'string') rawText += c.text;
            else if (c && c.type === 'output_text' && typeof c.text === 'string') rawText += c.text;
          }
        }
      }
    } catch (_e) {
      // ignore
    }

    // Parse structured JSON
    let insights: StructuredInsights | null = null;
    try {
      const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.highlights && parsed.warnings && parsed.trends) {
        insights = {
          highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 5) : [],
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 4) : [],
          trends: Array.isArray(parsed.trends) ? parsed.trends.slice(0, 3) : [],
        };
      }
    } catch (_e) {
      // JSON parse failed
    }

    if (!insights) {
      insights = generateFallbackInsights(metrics);
    }

    return NextResponse.json({ insights, metrics: payload });
  } catch (err: any) {
    console.error('narrative error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/* ── Rule-based fallback (no AI needed) ── */

function fmtH(mins: number) {
  return (mins / 60).toFixed(1);
}

function generateFallbackInsights(m: WeeklyMetrics): StructuredInsights {
  const highlights: string[] = [];
  const warnings: string[] = [];
  const trends: string[] = [];

  // Highlights
  highlights.push(`Total tracked: ${fmtH(m.totalMinutes)}h across ${m.projectTotals.length} project${m.projectTotals.length !== 1 ? 's' : ''}.`);
  if (m.projectTotals[0]) {
    const pct = m.totalMinutes > 0 ? Math.round((m.projectTotals[0].minutes / m.totalMinutes) * 100) : 0;
    highlights.push(`Top project: ${m.projectTotals[0].projectName} (${pct}% of total).`);
  }
  if (m.coveragePercent >= 80) highlights.push(`Strong coverage: ${m.coveragePercent}% of work week tracked.`);
  if (m.activeDays >= 5) highlights.push(`Active ${m.activeDays} days this week.`);

  // Warnings
  if (m.coveragePercent < 60) warnings.push(`Low coverage: only ${m.coveragePercent}% tracked (~${fmtH(m.estimatedUntrackedMinutes)}h untracked).`);
  if (m.zeroActivityDays.length > 0) warnings.push(`${m.zeroActivityDays.length} day${m.zeroActivityDays.length > 1 ? 's' : ''} with zero activity.`);
  if (m.overlapCount > 0) warnings.push(`${m.overlapCount} overlap${m.overlapCount > 1 ? 's' : ''} detected (${fmtH(m.overlapTotalMinutes)}h double-booked).`);
  if (m.inactiveProjects.length > 0) warnings.push(`${m.inactiveProjects.length} assigned project${m.inactiveProjects.length > 1 ? 's' : ''} with no activity.`);
  if (m.lowActivityDays.length > 0) warnings.push(`${m.lowActivityDays.length} day${m.lowActivityDays.length > 1 ? 's' : ''} with less than 30 min of activity.`);

  // Trends
  if (m.prevWeekTotalMinutes != null && m.prevWeekTotalMinutes > 0) {
    const delta = m.totalMinutes - m.prevWeekTotalMinutes;
    const pct = Math.round((Math.abs(delta) / m.prevWeekTotalMinutes) * 100);
    if (delta > 0) trends.push(`Total time increased ${pct}% vs last week.`);
    else if (delta < 0) trends.push(`Total time decreased ${pct}% vs last week.`);
    else trends.push('Total time unchanged from last week.');
  }
  const meetPct = m.totalMinutes > 0 ? Math.round((m.totalMeetingMinutes / m.totalMinutes) * 100) : 0;
  if (meetPct > 40) trends.push(`Meetings consume ${meetPct}% of tracked time.`);
  else if (meetPct > 0) trends.push(`Meetings account for ${meetPct}% of tracked time.`);

  return { highlights, warnings, trends };
}
