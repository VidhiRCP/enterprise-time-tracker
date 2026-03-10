import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";

type CsvRow = {
  pm_name: string;
  pm_email: string;
  project_name: string;
  project_id: string;
};

async function main() {
  const fileFlagIndex = process.argv.indexOf("--file");
  const filePath = fileFlagIndex >= 0 ? process.argv[fileFlagIndex + 1] : undefined;
  if (!filePath) throw new Error("Usage: npm run import:assignments -- --file ./data/pm_project_assignments.csv");

  const csvContent = await readFile(filePath, "utf8");
  const rows = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];

  for (const row of rows) {
    const email = row.pm_email.toLowerCase();

    const user = await prisma.user.upsert({
      where: { email },
      update: { displayName: row.pm_name, active: true },
      create: { email, displayName: row.pm_name, active: true },
    });

    const project = await prisma.project.upsert({
      where: { projectId: row.project_id },
      update: { projectName: row.project_name, active: true },
      create: { projectId: row.project_id, projectName: row.project_name, active: true },
    });

    await prisma.projectAssignment.upsert({
      where: { userId_projectId: { userId: user.id, projectId: project.projectId } },
      update: { active: true },
      create: { userId: user.id, projectId: project.projectId, active: true },
    });
  }

  console.log(`Imported ${rows.length} assignment rows.`);
}

main().finally(async () => {
  await prisma.$disconnect();
});
