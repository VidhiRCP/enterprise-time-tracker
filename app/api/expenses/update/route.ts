import { NextResponse } from "next/server";
import { updateExpenseEntry } from "@/lib/expenses";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await updateExpenseEntry(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message ?? err) }, { status: 500 });
  }
}
