/**
 * Text-to-Speech API Route
 * 
 * Uses ElevenLabs API for high-quality, human-like voice synthesis.
 * Returns audio as a streaming response for low latency.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ElevenLabs voice IDs - these are pre-made voices that sound natural
// You can find more at https://elevenlabs.io/voice-library
const VOICE_IDS = {
  // Female voices
  rachel: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, friendly
  bella: "EXAVITQu4vr4xnSDxMaL",   // Bella - soft, gentle
  elli: "MF3mGyEYCl7XYWbV9V6O",    // Elli - young, energetic
  
  // Male voices  
  adam: "pNInz6obpgDQGcFmaJgB",    // Adam - deep, confident
  josh: "TxGEqnHWrfWFTfGW9XjX",    // Josh - young, casual
  sam: "yoZ06aMxZJJ28mfd3POQ",     // Sam - raspy, authentic
};

// Default to Rachel for a warm, friendly shopping assistant voice
const DEFAULT_VOICE_ID = VOICE_IDS.rachel;

interface TTSRequestBody {
  text: string;
  voiceId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TTSRequestBody;
    const { text, voiceId = DEFAULT_VOICE_ID } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.warn("[TTS] ElevenLabs API key not configured, returning error");
      return NextResponse.json(
        { error: "TTS not configured. Add ELEVENLABS_API_KEY to .env.local" },
        { status: 503 }
      );
    }

    // Clean text for speech
    const cleanedText = text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // Remove emojis
      .replace(/[*_~`#]/g, "") // Remove markdown
      .replace(/\n+/g, " ") // Replace newlines with spaces
      .trim();

    if (!cleanedText) {
      return NextResponse.json(
        { error: "Text contains no speakable content" },
        { status: 400 }
      );
    }

    // Call ElevenLabs API
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_monolingual_v1", // Fast, high-quality model
          voice_settings: {
            stability: 0.5,        // Balance between consistency and expressiveness
            similarity_boost: 0.75, // How closely to match the original voice
            style: 0.5,            // Speaking style emphasis
            use_speaker_boost: true, // Enhance clarity
          },
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("[TTS] ElevenLabs error:", elevenLabsResponse.status, errorText);
      
      // Return specific error for quota/auth issues
      if (elevenLabsResponse.status === 401) {
        return NextResponse.json(
          { error: "Invalid ElevenLabs API key" },
          { status: 401 }
        );
      }
      if (elevenLabsResponse.status === 429) {
        return NextResponse.json(
          { error: "TTS quota exceeded. Please try again later." },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: 500 }
      );
    }

    // Stream the audio response back
    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error("[TTS] Unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS failed" },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text");
  
  if (!text) {
    return NextResponse.json(
      { 
        message: "TTS API is ready",
        usage: "POST /api/tts with { text: 'Your text here' }",
        voices: Object.keys(VOICE_IDS),
      },
      { status: 200 }
    );
  }
  
  // Forward to POST handler
  const fakeRequest = new NextRequest(request.url, {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "Content-Type": "application/json" },
  });
  
  return POST(fakeRequest);
}

