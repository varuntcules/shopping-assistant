import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import gTTS from "gtts";

export const runtime = "nodejs";

// Fallback function to generate TTS using Google TTS
async function generateGoogleTTS(text: string): Promise<NextResponse> {
  return new Promise((resolve, reject) => {
    try {
      // Clean text for Google TTS (remove pause markers that were for ElevenLabs)
      let cleanText = text.replace(/\.\.\./g, ' ').replace(/\s+/g, ' ').trim();
      
      // Google TTS handles text splitting internally, but we should still clean it
      // Remove any special formatting that might cause issues
      cleanText = cleanText.replace(/Product \d+:/g, '').trim();
      
      // Limit text length to prevent issues (Google TTS can handle up to ~5000 chars, but we'll be conservative)
      const maxLength = 4000;
      const finalText = cleanText.length > maxLength 
        ? cleanText.substring(0, maxLength) + '...' 
        : cleanText;
      
      console.log("[TTS] Using Google TTS fallback for text length:", finalText.length);
      
      const gtts = new gTTS(finalText, 'en');
      const chunks: Buffer[] = [];
      const stream = gtts.stream();
      
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        console.log("[TTS] Google TTS audio generated successfully, size:", audioBuffer.length);
        
        resolve(new NextResponse(audioBuffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length.toString(),
            "Cache-Control": "no-cache",
          },
        }));
      });
      
      stream.on('error', (error: Error) => {
        console.error("[TTS] Google TTS stream error:", error);
        reject(error);
      });
    } catch (error) {
      console.error("[TTS] Google TTS initialization error:", error);
      reject(error);
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[TTS] ELEVENLABS_API_KEY is not set");
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured. Please set ELEVENLABS_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    // Log API key presence (first 10 chars only for security)
    console.log("[TTS] API key found:", apiKey.substring(0, 10) + "...");

    const client = new ElevenLabsClient({
      apiKey: apiKey,
    });

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "Fahco4VZzobUeiPqni1S";
    console.log("[TTS] Using voice ID:", voiceId);

    console.log("[TTS] Generating speech for text:", text.substring(0, 50));

    // Validate and clean the text
    let processedText = String(text).trim();
    
    if (!processedText || processedText.length === 0) {
      return NextResponse.json(
        { error: "Text is empty after processing" },
        { status: 400 }
      );
    }

    // Log the original and processed text length for debugging
    console.log("[TTS] Original text length:", text.length);
    console.log("[TTS] Processed text length:", processedText.length);
    console.log("[TTS] Full processed text:", processedText);

    // Add minimal pauses for natural speech without slowing down too much
    // Shorter pauses for faster, more natural pace
    processedText = processedText.replace(/(Product \d+:)/g, '$1...');
    // Add shorter pauses after periods and commas for faster speech
    processedText = processedText.replace(/\. /g, '. ... ');
    processedText = processedText.replace(/, /g, ', ... ');
    // Minimal pause before "at" in price mentions
    processedText = processedText.replace(/\s+at\s+/g, ' ... at ');
    
    // Ensure text is not too long (ElevenLabs has limits)
    const maxLength = 5000; // ElevenLabs character limit
    if (processedText.length > maxLength) {
      console.warn(`[TTS] Text is too long (${processedText.length} chars), truncating to ${maxLength}`);
      processedText = processedText.substring(0, maxLength);
    }
    
    try {
      const audioStream = await client.textToSpeech.convert(voiceId, {
        text: processedText,
        modelId: "eleven_turbo_v2_5", // Use turbo model for faster, more natural speech
        voiceSettings: {
          stability: 0.35, // Lower stability for faster, more natural speech (was 0.7)
          similarityBoost: 0.9, // Higher similarity for more human-like voice (was 0.75)
          style: 0.4, // Add more style/expressiveness for more natural speech (was 0.0)
          useSpeakerBoost: true,
        },
      });

    const chunks: Uint8Array[] = [];
      // Convert ReadableStream to async iterable
      const reader = audioStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
      } finally {
        reader.releaseLock();
    }

    const audioBuffer = Buffer.concat(chunks);

    console.log("[TTS] Audio generated successfully, size:", audioBuffer.length);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
    } catch (elevenLabsError: any) {
      // Try to extract error details from various possible locations
      let errorBody: any = null;
      let rawErrorMessage: string = "";
      
      // Check different possible error formats
      if (elevenLabsError?.body) {
        try {
          errorBody = typeof elevenLabsError.body === 'string' 
            ? JSON.parse(elevenLabsError.body) 
            : elevenLabsError.body;
        } catch (e) {
          errorBody = { raw: elevenLabsError.body };
        }
      }
      
      if (elevenLabsError?.message) {
        rawErrorMessage = elevenLabsError.message;
      }
      
      console.error("[TTS] ElevenLabs API error:", {
        message: rawErrorMessage,
        status: elevenLabsError?.status,
        statusText: elevenLabsError?.statusText,
        response: elevenLabsError?.response,
        body: errorBody,
        fullError: elevenLabsError,
      });
      
      // Parse error response body if available
      let errorDetail: any = errorBody || null;
      if (!errorDetail) {
        try {
          if (elevenLabsError?.body) {
            errorDetail = typeof elevenLabsError.body === 'string' 
              ? JSON.parse(elevenLabsError.body) 
              : elevenLabsError.body;
          } else if (elevenLabsError?.response) {
            errorDetail = typeof elevenLabsError.response === 'string'
              ? JSON.parse(elevenLabsError.response)
              : elevenLabsError.response;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }
      
      // Provide more helpful error messages
      let errorMessage = "Failed to generate speech";
      let userFriendlyMessage = "Unable to generate speech audio.";
      
      // Check for account issue first (before checking status code)
      // The error detail is in errorBody.detail or errorDetail.detail
      const isAccountIssue = 
        errorDetail?.detail?.status === "detected_unusual_activity" || 
        errorBody?.detail?.status === "detected_unusual_activity" ||
        errorDetail?.status === "detected_unusual_activity" ||
        errorBody?.status === "detected_unusual_activity";
      
      // Check status code - can be in statusCode, status, or rawResponse.status field
      const errorStatus = elevenLabsError?.statusCode || 
                         elevenLabsError?.status || 
                         elevenLabsError?.rawResponse?.status;
      
      // Determine if we should fall back to Google TTS
      // Fall back for: account issues, rate limits, network errors, or any 5xx errors
      const shouldFallback = isAccountIssue || 
                            errorStatus === 429 || 
                            (errorStatus && errorStatus >= 500) ||
                            (errorStatus && errorStatus < 400 && errorStatus !== 401 && errorStatus !== 404);
      
      if (shouldFallback) {
        // Fall back to Google TTS for recoverable errors
        const errorType = isAccountIssue ? "account issue" : 
                         errorStatus === 429 ? "rate limit" :
                         errorStatus >= 500 ? "server error" : "service error";
        console.warn(`[TTS] ElevenLabs ${errorType} detected (status: ${errorStatus}). Falling back to Google TTS.`);
        try {
          return await generateGoogleTTS(processedText);
        } catch (gttsError) {
          console.error("[TTS] Google TTS fallback also failed:", gttsError);
          // If Google TTS also fails, return appropriate error
          if (isAccountIssue) {
            return NextResponse.json(
              { 
                error: "TTS service unavailable",
                userMessage: "Voice responses are temporarily unavailable.",
                accountIssue: true,
                details: errorDetail?.detail || errorBody?.detail || null
              },
              { status: 503 }
            );
          }
          // For other errors, continue with original error message
        }
      }
      
      // For non-fallback errors, provide specific error messages
      if (errorStatus === 401) {
        errorMessage = "Invalid ElevenLabs API key";
        userFriendlyMessage = "Invalid ElevenLabs API key. Please check your ELEVENLABS_API_KEY in .env.local and ensure it's correct.";
      } else if (errorStatus === 404) {
        errorMessage = `Voice ID "${voiceId}" not found`;
        userFriendlyMessage = `Voice ID "${voiceId}" not found. Please check your ELEVENLABS_VOICE_ID in .env.local or use a valid voice ID from your ElevenLabs account.`;
      } else if (errorDetail?.detail?.message) {
        errorMessage = errorDetail.detail.message;
        userFriendlyMessage = errorDetail.detail.message;
      } else if (elevenLabsError?.message) {
        errorMessage = `ElevenLabs API error: ${elevenLabsError.message}`;
        userFriendlyMessage = elevenLabsError.message;
      }
      
      console.error("[TTS] Error details:", {
        errorMessage,
        userFriendlyMessage,
        errorDetail,
      });
      
      return NextResponse.json(
        { 
          error: errorMessage,
          userMessage: userFriendlyMessage,
          details: errorDetail?.detail || null
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[TTS] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate speech: ${errorMessage}` },
      { status: 500 }
    );
  }
}



