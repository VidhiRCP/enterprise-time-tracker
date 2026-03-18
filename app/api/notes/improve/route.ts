import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireEmail() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session.user.email.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const email = await requireEmail();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const note = (body?.note ?? "").toString().trim();
    const projectId = body?.projectId ?? null;

    if (!note) return NextResponse.json({ suggestion: null });

    // Server-side: gather small context — recent notes for the user and project
    const recent = await prisma.timeEntry.findMany({
      where: { user: { email }, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { notes: true, projectId: true },
    });

    const recentNotes = recent.map((r) => r.notes).filter(Boolean).slice(0, 5);

    // Build prompt
    const system = `You are a terse professional assistant that rewrites short vague time-tracking notes into a single concise, specific, and professional sentence suitable for a project timesheet. Use project context if provided. Return only the rewritten note (one sentence), no bullets, no explanation.`;

    const userText = `Original note: "${note.replace(/"/g, '\\"')}"\n` +
      (projectId ? `Project ID: ${projectId}\n` : "") +
      (recentNotes.length ? `Recent notes: ${JSON.stringify(recentNotes)}\n` : "");

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model, input: [ { role: 'user', content: [ { type: 'input_text', text: system }, { type: 'input_text', text: userText } ] } ], max_output_tokens: 120 }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: 'OpenAI request failed', detail: txt }, { status: 502 });
    }

    const data = await resp.json();
    let suggestion: string | null = null;
    try {
      if (Array.isArray(data.output)) {
        for (const out of data.output) {
          if (!out || !Array.isArray(out.content)) continue;
          for (const c of out.content) {
            if (c && typeof c.text === 'string') {
              suggestion = (suggestion ? suggestion + '\n' : '') + c.text;
            }
          }
        }
      }
    } catch (_e) {
      suggestion = null;
    }

    if (!suggestion) suggestion = data?.output?.[0]?.content?.[0]?.text ?? null;
    if (suggestion) suggestion = suggestion.trim().replace(/\s+/g, ' ');

    // Ensure we don't return the same text
    if (suggestion && suggestion.toLowerCase() === note.toLowerCase()) suggestion = null;

    return NextResponse.json({ suggestion });
  } catch (err: any) {
    console.error('note improve error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
