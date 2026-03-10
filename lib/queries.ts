import { prisma } from "@/lib/prisma";

export async function getDashboardData(email: string) {
  const [projects, entries, session] = await Promise.all([
    prisma.project.findMany({
      where: {
        active: true,
        assignments: {
          some: {
            active: true,
            user: { email: email.toLowerCase() },
          },
        },
      },
      orderBy: { projectName: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        user: { email: email.toLowerCase() },
      },
      include: {
        project: true,
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.timerSession.findFirst({
      where: {
        user: { email: email.toLowerCase() },
        status: { in: ["RUNNING", "PAUSED"] },
      },
      include: { project: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return { projects, entries, session };
}