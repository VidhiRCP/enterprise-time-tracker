-- Migration: add_expenses (created by assistant)

-- ExpenseReceipt
CREATE TABLE IF NOT EXISTS public."ExpenseReceipt" (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  "userId" text NOT NULL,
  "projectId" text,
  "filePath" text NOT NULL,
  "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "pk_expense_receipt" PRIMARY KEY (id),
  CONSTRAINT "fk_receipt_user" FOREIGN KEY ("userId") REFERENCES public."User"(id),
  CONSTRAINT "fk_receipt_project" FOREIGN KEY ("projectId") REFERENCES public."Project"("projectId")
);

CREATE INDEX IF NOT EXISTS idx_expense_receipt_user ON public."ExpenseReceipt" ("userId");
CREATE INDEX IF NOT EXISTS idx_expense_receipt_project ON public."ExpenseReceipt" ("projectId");

-- ExpenseExtraction (one-to-one with ExpenseReceipt)
CREATE TABLE IF NOT EXISTS public."ExpenseExtraction" (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  "receiptId" text NOT NULL,
  "rawJson" jsonb NOT NULL,
  "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "pk_expense_extraction" PRIMARY KEY (id),
  CONSTRAINT "uq_expense_extraction_receipt" UNIQUE ("receiptId"),
  CONSTRAINT "fk_extraction_receipt" FOREIGN KEY ("receiptId") REFERENCES public."ExpenseReceipt"(id)
);

-- ExpenseEntry
CREATE TABLE IF NOT EXISTS public."ExpenseEntry" (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  "userId" text NOT NULL,
  "projectId" text NOT NULL,
  "receiptId" text,
  "expenseDate" timestamp(3) without time zone NOT NULL,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL,
  merchant text NOT NULL,
  details text NOT NULL,
  "receiptFilePath" text NOT NULL,
  "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "pk_expense_entry" PRIMARY KEY (id),
  CONSTRAINT "uq_expense_entry_receipt" UNIQUE ("receiptId"),
  CONSTRAINT "fk_entry_user" FOREIGN KEY ("userId") REFERENCES public."User"(id),
  CONSTRAINT "fk_entry_project" FOREIGN KEY ("projectId") REFERENCES public."Project"("projectId"),
  CONSTRAINT "fk_entry_receipt" FOREIGN KEY ("receiptId") REFERENCES public."ExpenseReceipt"(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_entry_user ON public."ExpenseEntry" ("userId");
CREATE INDEX IF NOT EXISTS idx_expense_entry_project ON public."ExpenseEntry" ("projectId");
