import { prisma } from "@/lib/prisma";

export async function ensureProjectAccess(email: string, projectId: string) {
  const assignment = await prisma.projectAssignment.findFirst({
    where: {
      projectId,
      active: true,
      user: { email: email.toLowerCase() },
    },
  });

  if (!assignment) {
    throw new Error("You are not assigned to this project.");
  }

  return assignment;
}