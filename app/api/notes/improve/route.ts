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

    // Fetch the project name for richer context
    let projectName: string | null = null;
    if (projectId) {
      const proj = await prisma.project.findUnique({
        where: { projectId },
        select: { projectName: true },
      });
      projectName = proj?.projectName ?? null;
    }

    // Build prompt — rephrase / improve the user's note naturally
    const system = [
      `You are a helpful writing assistant. The user is logging time on a project and wants you to improve or rephrase their note so it reads clearly and professionally.`,
      `Rules:`,
      `- Output ONLY the improved note. No quotes, no bullets, no labels, no explanation.`,
      `- Keep the same tense and intent the user wrote in. Do NOT force past tense.`,
      `- Fix any typos or grammar issues.`,
      `- Make it clearer, more concise, and suitable for a timesheet or status report.`,
      `- Use the project name/context to add specificity when it helps.`,
      `- Match the length of the original — short notes stay short, detailed notes stay detailed.`,
      `- Never invent tasks or details not implied by the original note.`,
      `- If the note already reads well, make a small stylistic improvement — never return it unchanged.`,
    ].join('\n');

    const contextParts = [`Original note: "${note.replace(/"/g, '\\"')}"`];
    if (projectId) contextParts.push(`Project ID: ${projectId}`);
    if (projectName) contextParts.push(`Project name: ${projectName}`);
    if (recentNotes.length) contextParts.push(`User's recent notes on this project for context: ${JSON.stringify(recentNotes)}`);
    const userText = contextParts.join('\n');

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
        max_tokens: 256,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('OpenAI error', resp.status, txt);
      return NextResponse.json({ error: 'OpenAI request failed', detail: txt }, { status: 502 });
    }

    const data = await resp.json();
    let suggestion: string | null = data?.choices?.[0]?.message?.content?.trim() ?? null;
    if (suggestion) suggestion = suggestion.replace(/^["']|["']$/g, '').trim();

    // Ensure we don't return the same text
    if (suggestion && suggestion.toLowerCase() === note.toLowerCase()) suggestion = null;

    return NextResponse.json({ suggestion });
  } catch (err: any) {
    console.error('note improve error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
