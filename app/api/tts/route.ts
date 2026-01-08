/**
 * Text-to-Speech API Route
 * 
 * Converts text to speech using ElevenLabs API and streams audio back to client.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel (neutral, natural voice)

export async function POST(request: NextRequest) {
  try {
    if (!ELEVENLABS_API_KEY) {
      console.error("[TTS] ELEVENLABS_API_KEY not configured");
      return NextResponse.json(
        { error: "TTS service not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Call ElevenLabs TTS API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_multilingual_v2", // Multilingual model for better INR/rupees pronunciation
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[TTS] ElevenLabs API error:", response.status, errorText);
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: response.status }
      );
    }

    // Stream audio back to client
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[TTS] Unexpected error:", error);
    return NextResponse.json(
      { error: "TTS service error" },
      { status: 500 }
    );
  }
}
