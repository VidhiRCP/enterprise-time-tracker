import { NextResponse } from "next/server";
import { saveExpenseReview } from "@/lib/expenses";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await saveExpenseReview(body);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message ?? err) }, { status: 500 });
  }
}
