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

  const projects = await prisma.project.findMany({ select: { projectId: true, projectName: true }, orderBy: { projectName: 'asc' } });
  return NextResponse.json({ projects });
}
