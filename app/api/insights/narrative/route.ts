import { NextResponse } from 'next/server';
import { getWeeklyMetrics } from '@/lib/insights';
import { auth } from '@/auth';

async function requireEmail() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session.user.email.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const email = await requireEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const weekStart = body?.weekStart;
    if (!weekStart) return NextResponse.json({ error: 'weekStart required' }, { status: 400 });

    const metrics = await getWeeklyMetrics(email, weekStart);

    // If there's no activity at all, return empty narrative
    if ((metrics.totalMinutes ?? 0) === 0 && (!metrics.expenseSummary || metrics.expenseSummary.count === 0)) {
      return NextResponse.json({ narrative: null, metrics });
    }

    // Build concise payload to send to OpenAI — avoid raw rows
    const payload = {
      weekStart: metrics.weekStart,
      weekEnd: metrics.weekEnd,
      totalMinutes: metrics.totalMinutes,
      projectTotals: metrics.projectTotals.map((p) => ({ projectId: p.projectId, projectName: p.projectName, minutes: p.minutes })),
      meetingMinutes: metrics.meetingMinutes,
      meetingMinutesPrevWeek: metrics.meetingMinutesPrevWeek,
      zeroActivityDays: metrics.zeroActivityDays,
      lowActivityDays: metrics.lowActivityDays,
      inactiveProjects: metrics.inactiveProjects,
      expenseSummary: metrics.expenseSummary,
    };

    // Call OpenAI Responses API
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const system = `You are an assistant that writes concise, practical weekly summaries for project managers. Use the provided metrics to produce a short (3-6 sentence) narrative focused on priorities, changes, and notable items. Mention top project(s), percent split, meeting trend (increased/decreased with percent), any zero-activity days, low-activity days, inactive projects, and a short note on expenses if present. Do not invent facts; only use the metrics provided.`;

    const userContent = `Metrics: ${JSON.stringify(payload)}`;

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model, input: [ { role: 'user', content: [ { type: 'input_text', text: system }, { type: 'input_text', text: userContent } ] } ], max_output_tokens: 300 }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: 'OpenAI request failed', detail: txt }, { status: 502 });
    }
    const data = await resp.json();

    // Extract textual output
    let narrative = null;
    try {
      if (Array.isArray(data.output)) {
        for (const out of data.output) {
          if (!out || !Array.isArray(out.content)) continue;
          for (const c of out.content) {
            if (c && typeof c.text === 'string') {
              narrative = (narrative ? narrative + '\n' : '') + c.text;
            } else if (c && c.type === 'output_text' && typeof c.text === 'string') {
              narrative = (narrative ? narrative + '\n' : '') + c.text;
            }
          }
        }
      }
    } catch (_e) {
      narrative = null;
    }

    // Fallback: try older field
    if (!narrative) narrative = data?.output?.[0]?.content?.[0]?.text ?? null;

    return NextResponse.json({ narrative, metrics: payload });
  } catch (err: any) {
    console.error('narrative error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
