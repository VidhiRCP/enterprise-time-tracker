# RCP Time Tracker Enterprise Starter

This starter is set up for:
- Next.js
- Microsoft Entra ID
- Supabase Postgres
- Prisma
- Vercel

## Run locally

1. Create `.env` from `.env.example`
2. Install packages

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run import:assignments -- --file ./data/pm_project_assignments.csv
npm run dev
```

Then open `http://localhost:3000`.

## CSV format

```csv
pm_name,pm_email,project_name,project_id
Alice PM,alice.pm@company.com,ERP Upgrade,ERP-001
Bob PM,bob.pm@company.com,Data Platform Rollout,DATA-002
```
