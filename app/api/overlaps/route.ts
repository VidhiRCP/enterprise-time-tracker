import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { detectOverlaps, detectTodayOverlaps } from "@/lib/overlap-detection";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = session.user.email.toLowerCase();

  // If rangeStart/rangeEnd provided, use them; otherwise detect for today
  if (body?.rangeStart && body?.rangeEnd) {
    const result = await detectOverlaps(email, body.rangeStart, body.rangeEnd);
    return NextResponse.json(result);
  }

  const result = await detectTodayOverlaps(email);
  return NextResponse.json(result);
}
