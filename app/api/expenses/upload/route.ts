import { NextResponse } from "next/server";
import { uploadReceiptAndExtract } from "@/lib/expenses";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const result = await uploadReceiptAndExtract(file as any);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message ?? err) }, { status: 500 });
  }
}
