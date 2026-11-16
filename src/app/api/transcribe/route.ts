import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const maxDuration = 60;

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

  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const transcriptionModelId =
    process.env.AI_TRANSCRIPTION_MODEL ||
    (provider === "openai" ? "whisper-1" : "");

  try {
    if (provider === "openai" || !provider || transcriptionModelId) {
      if (!process.env.OPENAI_API_KEY && provider !== "google") {
        // fall through to explicit error below
      }
      const modelId = transcriptionModelId || "whisper-1";
      const audio = new Uint8Array(await file.arrayBuffer());
      const result = await transcribe({
        model: openai.transcription(modelId),
        audio,
      });
      const text = String(result.text ?? "").trim();
      return NextResponse.json({ text });
    }

    // Google provider currently may not expose a transcription model in this setup.
    // If GOOGLE is selected but no compatible transcription path is available, return a clear error.
    return NextResponse.json(
      { error: "Transcription is not configured for the selected AI provider. Set OPENAI_API_KEY and/or AI_TRANSCRIPTION_MODEL." },
      { status: 501 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to transcribe audio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
