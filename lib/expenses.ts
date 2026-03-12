"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { ensureProjectAccess } from "@/lib/authz";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");
  return session as (typeof session & { user: { email: string; id?: string } });
}

export async function uploadReceiptAndExtract(file: File) {
  const session = await requireUser();
  const userEmail = session.user.email.toLowerCase();

  // Init Supabase admin client
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required. Add SUPABASE_URL to your .env.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required. Add SUPABASE_SERVICE_ROLE_KEY to your .env.");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const bucketName = process.env.SUPABASE_BUCKET ?? "receipts";

  // Resolve DB user id to ensure filename uses the canonical user id from the database
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
  const userId = dbUser.id;
  const timestamp = Date.now();
  const filename = `${userId}/${timestamp}-${file.name}`;

  // Upload to 'receipts' bucket
  const { data: up, error: upErr } = await supabase.storage.from(bucketName).upload(filename, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (upErr) {
    const msg = String(upErr.message ?? upErr);
    if (msg.toLowerCase().includes("bucket not found")) {
      throw new Error(`Upload failed: bucket '${bucketName}' not found. Create the bucket in Supabase Storage or set SUPABASE_BUCKET to the correct bucket name.`);
    }
    throw new Error("Upload failed: " + msg);
  }

  // Create a short-lived signed URL so receipts can remain private
  const expiresIn = 60 * 60; // 1 hour
  const { data: signed, error: signErr } = await supabase.storage.from(bucketName).createSignedUrl(filename, expiresIn);
  let publicUrl: string | null = null;
  if (signErr) {
    // fallback to public URL if signed URL fails for some reason
    const publicFallback = supabase.storage.from(bucketName).getPublicUrl(filename).data.publicUrl;
    if (!publicFallback) throw new Error("Failed to create signed URL and no public URL available: " + String(signErr.message ?? signErr));
    console.warn("createSignedUrl failed, falling back to public URL:", signErr);
    publicUrl = publicFallback;
  } else {
    // supabase client may return signedURL or signedUrl depending on version
    publicUrl = (signed as any).signedURL ?? (signed as any).signedUrl ?? null;
  }

  // Call OpenAI to extract fields (server-side only)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OpenAI API key not configured");

  const prompt = `You are a precise receipt extraction engine for enterprise expense tracking.
Be conservative.
If you are uncertain, return null.
Never guess missing values.
Return valid JSON only.

You are extracting structured expense data from a receipt image or PDF for an enterprise expense tracker.

Your job is to read the receipt and return only valid JSON.

Extract these fields:

- date: the receipt purchase date in YYYY-MM-DD format if possible, otherwise null
- amount_total: the final total amount paid, as a number, otherwise null
- currency: 3-letter currency code like NZD, AUD, USD, GBP, EUR, otherwise null
- merchant: merchant or vendor name, otherwise null
- details: a short clean summary of the purchase, otherwise null
- subtotal: subtotal before tax/tip if visible, otherwise null
- tax: tax/GST/VAT amount if visible, otherwise null
- tip: tip/gratuity amount if visible, otherwise null
- receipt_number: receipt, invoice, transaction, or reference number if visible, otherwise null
- payment_method: card, cash, visa, mastercard, amex, debit, etc. if visible, otherwise null
- merchant_address: merchant address if clearly visible, otherwise null
- confidence: a number from 0 to 1 representing confidence in the extraction
- warnings: array of short strings for ambiguity or missing fields

Rules:
1. Return JSON only. No markdown. No explanation.
2. If a field is unclear, return null instead of guessing.
3. amount_total must be the final amount paid, not subtotal.
4. If multiple totals appear, prefer the one explicitly labeled total, amount due, amount paid, or balance paid.
5. If the receipt appears to be a tax invoice, still extract the final amount paid as amount_total.
6. details should be a short human-friendly summary of the purchase.
7. Normalize currency to ISO-style 3-letter code if you are confident. Otherwise null.
8. Normalize date to YYYY-MM-DD if you are confident. Otherwise null.
9. Do not invent project codes or allocations.
10. Do not include fields outside the requested schema.

Return this exact JSON shape:

{
  "date": null,
  "amount_total": null,
  "currency": null,
  "merchant": null,
  "details": null,
  "subtotal": null,
  "tax": null,
  "tip": null,
  "receipt_number": null,
  "payment_method": null,
  "merchant_address": null,
  "confidence": 0,
  "warnings": []
}

The receipt is accessible at: ${publicUrl}`;

  // Send a multimodal request to OpenAI: include the prompt and the image URL so the model can read the receipt image.
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      // Include system and a multimodal user message: text prompt + image_url
      messages: [
        { role: "system", content: "You extract structured JSON from receipts. Return JSON only." },
        { role: "user", content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: publicUrl }
          ]
        },
      ],
      max_tokens: 800,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("OpenAI request failed: " + txt);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";

  // Try to parse JSON
  let extracted: any = {};
  try {
    extracted = JSON.parse(text);
  } catch (e) {
    // Try to find JSON substring
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { extracted = JSON.parse(m[0]); } catch (_err) {
        extracted = null;
      }
    } else {
      extracted = null;
    }
  }

  // Ensure the extracted shape exists and falls back to nulls/confidence 0
  if (!extracted || typeof extracted !== 'object') {
    extracted = {
      date: null,
      amount_total: null,
      currency: null,
      merchant: null,
      details: null,
      subtotal: null,
      tax: null,
      tip: null,
      receipt_number: null,
      payment_method: null,
      merchant_address: null,
      confidence: 0,
      warnings: [],
    };
  }

  // Persist receipt record
  const receipt = await prisma.expenseReceipt.create({
    // Use unchecked/explicit shape to avoid generated type constraints for optional relations
    data: ({
      userId: userId,
      filePath: filename,
    } as any),
  });

  // Persist raw extraction
  await prisma.expenseExtraction.create({
    data: {
      receiptId: receipt.id,
      rawJson: extracted,
    },
  });

  return { receiptId: receipt.id, filePath: filename, publicUrl, extracted };
}

// Upload file to storage and run AI extraction but do NOT persist any DB rows.
export async function uploadToStorageAndExtractOnly(file: File) {
  const session = await requireUser();
  const userEmail = session.user.email.toLowerCase();

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required. Add SUPABASE_URL to your .env.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required. Add SUPABASE_SERVICE_ROLE_KEY to your .env.");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const bucketName = process.env.SUPABASE_BUCKET ?? "receipts";

  const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
  const userId = user.id;
  const timestamp = Date.now();
  const filename = `${userId}/${timestamp}-${file.name}`;

  const { data: up, error: upErr } = await supabase.storage.from(bucketName).upload(filename, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (upErr) throw new Error("Upload failed: " + String(upErr.message ?? upErr));

  const expiresIn = 60 * 60; // 1 hour
  const { data: signed, error: signErr } = await supabase.storage.from(bucketName).createSignedUrl(filename, expiresIn);
  let publicUrl: string | null = null;
  if (signErr) {
    publicUrl = supabase.storage.from(bucketName).getPublicUrl(filename).data.publicUrl;
  } else {
    publicUrl = (signed as any).signedURL ?? (signed as any).signedUrl ?? null;
  }

  // Call OpenAI to extract fields (server-side only)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OpenAI API key not configured");

  const prompt = `You are a precise receipt extraction engine for enterprise expense tracking.
Be conservative.
If you are uncertain, return null.
Never guess missing values.
Return valid JSON only.

You are extracting structured expense data from a receipt image or PDF for an enterprise expense tracker.

Your job is to read the receipt and return only valid JSON.

Extract these fields:

- date: the receipt purchase date in YYYY-MM-DD format if possible, otherwise null
- amount_total: the final total amount paid, as a number, otherwise null
- currency: 3-letter currency code like NZD, AUD, USD, GBP, EUR, otherwise null
- merchant: merchant or vendor name, otherwise null
- details: a short clean summary of the purchase, otherwise null
- subtotal: subtotal before tax/tip if visible, otherwise null
- tax: tax/GST/VAT amount if visible, otherwise null
- tip: tip/gratuity amount if visible, otherwise null
- receipt_number: receipt, invoice, transaction, or reference number if visible, otherwise null
- payment_method: card, cash, visa, mastercard, amex, debit, etc. if visible, otherwise null
- merchant_address: merchant address if clearly visible, otherwise null
- confidence: a number from 0 to 1 representing confidence in the extraction
- warnings: array of short strings for ambiguity or missing fields

Rules:
1. Return JSON only. No markdown. No explanation.
2. If a field is unclear, return null instead of guessing.
3. amount_total must be the final amount paid, not subtotal.
4. If multiple totals appear, prefer the one explicitly labeled total, amount due, amount paid, or balance paid.
5. If the receipt appears to be a tax invoice, still extract the final amount paid as amount_total.
6. details should be a short human-friendly summary of the purchase.
7. Normalize currency to ISO-style 3-letter code if you are confident. Otherwise null.
8. Normalize date to YYYY-MM-DD if you are confident. Otherwise null.
9. Do not invent project codes or allocations.
10. Do not include fields outside the requested schema.

Return this exact JSON shape:

{
  "date": null,
  "amount_total": null,
  "currency": null,
  "merchant": null,
  "details": null,
  "subtotal": null,
  "tax": null,
  "tip": null,
  "receipt_number": null,
  "payment_method": null,
  "merchant_address": null,
  "confidence": 0,
  "warnings": []
}

The receipt is accessible at: ${publicUrl}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      // Include system and a multimodal user message: text prompt + image_url
      messages: [
        { role: "system", content: "You extract structured JSON from receipts. Return JSON only." },
        { role: "user", content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: publicUrl }
          ]
        },
      ],
      max_tokens: 800,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("OpenAI request failed: " + txt);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "";

  let extracted: any = {};
  try {
    extracted = JSON.parse(text);
  } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { extracted = JSON.parse(m[0]); } catch (_err) { extracted = null; }
    } else {
      extracted = null;
    }
  }

  if (!extracted || typeof extracted !== 'object') {
    extracted = {
      date: null,
      amount_total: null,
      currency: null,
      merchant: null,
      details: null,
      subtotal: null,
      tax: null,
      tip: null,
      receipt_number: null,
      payment_method: null,
      merchant_address: null,
      confidence: 0,
      warnings: [],
    };
  }

  // Return file path + publicUrl + extraction but DO NOT persist DB rows.
  return { filePath: filename, publicUrl, extracted };
}

export async function saveExpenseReview(input: {
  receiptId: string;
  projectId: string;
  expenseDate: string; // YYYY-MM-DD
  amount: string;
  currency: string;
  merchant: string;
  details: string;
  rawExtraction?: any;
}) {
  const session = await requireUser();
  const userEmail = session.user.email.toLowerCase();

  await ensureProjectAccess(userEmail, input.projectId);

  // Validate input using Zod
  const Schema = z.object({
    receiptId: z.string().min(1),
    projectId: z.string().min(1),
    expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.string().min(1),
    currency: z.string().min(1),
    merchant: z.string().min(0),
    details: z.string().min(0),
    rawExtraction: z.any().optional(),
  });

  Schema.parse(input as any);

  // link or create receipt
  let receipt = null;
  try {
    receipt = await prisma.expenseReceipt.findUnique({ where: { id: input.receiptId } });
  } catch (_e) {
    receipt = null;
  }

  // If receipt not found by id, allow input to include a filePath in place of receiptId
  if (!receipt) {
    // try to interpret receiptId as a filePath if it looks like one
    const possibleFilePath = input.receiptId;
    if (possibleFilePath) {
      // create receipt using provided file path
      const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
      receipt = await prisma.expenseReceipt.create({ data: { userId: user.id, filePath: possibleFilePath as any } } as any);
      // persist extraction raw JSON if present in input.details? We don't expect it here — caller should create extraction if needed.
    } else {
      throw new Error("Receipt not found; provide a valid receiptId or upload the receipt first.");
    }
  }

  // persist extraction JSON if provided
  if (input.rawExtraction) {
    try {
      await prisma.expenseExtraction.upsert({
        where: { receiptId: receipt.id },
        update: { rawJson: input.rawExtraction },
        create: { receiptId: receipt.id, rawJson: input.rawExtraction },
      });
    } catch (e) {
      // ignore extraction persistence errors but log
      console.warn("Failed to persist extraction JSON:", e);
    }
  }

  // create expense entry
  const entry = await prisma.expenseEntry.create({
    data: {
      user: { connect: { email: userEmail } },
      project: { connect: { projectId: input.projectId } },
      expenseDate: new Date(`${input.expenseDate}T00:00:00.000Z`),
      amount: input.amount,
      currency: input.currency,
      merchant: input.merchant,
      details: input.details,
      receipt: { connect: { id: receipt.id } },
      receiptFilePath: receipt.filePath,
    },
  });

  // attach project to receipt if not set
  if (!receipt.projectId) {
    await prisma.expenseReceipt.update({ where: { id: receipt.id }, data: { projectId: input.projectId } });
  }

  revalidatePath("/");
  return { entry };
}

export async function getUserExpenses() {
  const session = await requireUser();
  if (!session?.user?.email) throw new Error("Unauthorized");
  const userEmail = session.user.email.toLowerCase();

  const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });

  const entries = await prisma.expenseEntry.findMany({
    where: { userId: user.id },
    include: { project: true, receipt: true },
    orderBy: { createdAt: "desc" },
  });

  // Build public URLs for receipts
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl) throw new Error("SUPABASE_URL environment variable is required. Add SUPABASE_URL to your .env.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required. Add SUPABASE_SERVICE_ROLE_KEY to your .env.");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const bucketName = process.env.SUPABASE_BUCKET ?? "receipts";

  const results = await Promise.all(entries.map(async (e) => {
    let publicUrl = null;
    if (e.receipt) {
      try {
        const { data: signed, error: signErr } = await supabase.storage.from(bucketName).createSignedUrl(e.receipt.filePath, 60 * 60);
        if (signErr) {
          publicUrl = supabase.storage.from(bucketName).getPublicUrl(e.receipt.filePath).data.publicUrl;
        } else {
          publicUrl = (signed as any).signedURL ?? (signed as any).signedUrl ?? null;
        }
      } catch (err) {
        publicUrl = supabase.storage.from(bucketName).getPublicUrl(e.receipt.filePath).data.publicUrl;
      }
    }
    return {
      id: e.id,
      expenseDate: e.expenseDate.toISOString().slice(0,10),
      amount: String(e.amount),
      currency: e.currency,
      merchant: e.merchant,
      details: e.details,
      projectName: e.project?.projectName ?? null,
      receiptFilePath: e.receiptFilePath,
      publicUrl,
    };
  }));

  return results;
}
