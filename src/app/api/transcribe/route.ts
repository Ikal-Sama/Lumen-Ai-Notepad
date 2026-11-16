import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const maxDuration = 60;

function resolveTranscriptionModel() {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const override = process.env.AI_TRANSCRIPTION_MODEL?.trim();

  if (provider === "google") {
    const modelId = override || "gemini-3.5-transcribe";
    return google.transcription(modelId);
  }

  const modelId = override || "whisper-1";
  return openai.transcription(modelId);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid audio upload." }, { status: 400 });
  }

  const file = formData.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  }

  // Guardrail: avoid very large uploads in serverless environments.
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio file is too large (max 20MB)." }, { status: 413 });
  }

  try {
    const audio = new Uint8Array(await file.arrayBuffer());
    const result = await transcribe({
      model: resolveTranscriptionModel(),
      audio,
    });
    const text = String(result.text ?? "").trim();
    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to transcribe audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
