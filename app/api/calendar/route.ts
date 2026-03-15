import { auth } from "@/auth";
import { getCalendarEvents } from "@/lib/calendar";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ groups: [], hasToken: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const accessToken = (session as any).accessToken as string | undefined;
  if (!accessToken) {
    return new Response(JSON.stringify({ groups: [], hasToken: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const weekStart = url.searchParams.get("weekStart") ?? undefined;
  const weekEnd = url.searchParams.get("weekEnd") ?? undefined;

  const groups = await getCalendarEvents(accessToken, session.user.email, weekStart ?? undefined, weekEnd ?? undefined);
  return new Response(JSON.stringify({ groups, hasToken: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
