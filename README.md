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

Testing Expense Extraction
--------------------------

1. Create a local `.env` from `.env.example` and fill in your keys. Ensure `SUPABASE_BUCKET` matches an existing Supabase Storage bucket (default: `receipts`) and that `SUPABASE_SERVICE_ROLE_KEY` is a service-role key.

2. Confirm `OPENAI_MODEL` is set to `gpt-4.1` (the code defaults to this when empty).

3. Start the app locally:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

4. Open `http://localhost:3000`, go to the Expense Tracker tab, and upload a receipt image or PDF.

5. The app performs a server-side extraction using the OpenAI Responses API (vision input). A debug panel shows the `rawResponse` returned by the model — use that to iterate on prompts if needed.

6. If extraction looks correct, select a project and click Save to persist the expense.

Troubleshooting
---------------
- If you get authentication/authorization DB errors, verify the database user and RLS policies. Run `SELECT current_user;` against your app DB to determine the role used by the app.
- If the Supabase upload fails, confirm the bucket name and that the service role key has storage permissions.
- If the model doesn't return valid JSON, inspect the `rawResponse` in the UI and paste it here for prompt adjustments.

## CSV format

```csv
pm_name,pm_email,project_name,project_id
Alice PM,alice.pm@company.com,ERP Upgrade,ERP-001
Bob PM,bob.pm@company.com,Data Platform Rollout,DATA-002
```
