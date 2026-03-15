import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function GET() {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.user.email?.toLowerCase();
  // return projects the user is assigned to (active assignments)
  const assignments = await prisma.projectAssignment.findMany({
    where: { active: true, user: { email } },
    include: { project: { select: { projectId: true, projectName: true } } },
    orderBy: { project: { projectName: 'asc' } },
  });

  const projects = assignments.map(a => ({ projectId: a.project.projectId, projectName: a.project.projectName }));
  return NextResponse.json({ projects });
}
