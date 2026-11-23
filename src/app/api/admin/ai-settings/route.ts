import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  deleteByokGeminiKey,
  getAiProviderStatus,
  saveByokGeminiKey,
  testByokGeminiKey,
} from "@/lib/ai";

const saveSchema = z.object({
  action: z.enum(["save", "test"]).default("save"),
  apiKey: z.string().optional(),
  textModel: z.string().default("gemini-3.8-flash"),
  imageModel: z.string().default("gemini-nano-banana-2.1"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = await getAiProviderStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI settings payload" }, { status: 400 });
  }

  if (parsed.data.action === "test") {
    const result = await testByokGeminiKey(parsed.data.apiKey);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const status = await getAiProviderStatus();
  if (!parsed.data.apiKey?.trim() && status.source === "none") {
    return NextResponse.json({ error: "API Key is required" }, { status: 400 });
  }

  await saveByokGeminiKey({
    apiKey: parsed.data.apiKey,
    textModel: parsed.data.textModel,
    imageModel: parsed.data.imageModel,
    actorId: user.id,
  });

  const updatedStatus = await getAiProviderStatus();
  return NextResponse.json({ ok: true, status: updatedStatus });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteByokGeminiKey(user.id);
  const status = await getAiProviderStatus();
  return NextResponse.json({ ok: true, status });
}
