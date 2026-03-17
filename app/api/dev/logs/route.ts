import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const outDir = path.resolve(process.cwd(), 'tmp_headless');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'insights_client_errors.log');
    const entry = `${new Date().toISOString()} - ${JSON.stringify(body)}\n`;
    fs.appendFileSync(file, entry);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
