import { NextResponse } from "next/server";
import { getUserExpenses } from "@/lib/expenses";

export async function GET() {
  try {
    const data = await getUserExpenses();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message ?? err) }, { status: 500 });
  }
}
