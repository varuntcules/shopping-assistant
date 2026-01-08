import { NextRequest } from "next/server";
import { createAgentUIStreamResponse } from "ai";
import { createInitialState, type CollectedInfo } from "@/lib/simpleAgent";
import { createGenerativeRetailAgent } from "@/lib/generativeAgent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { messages = [] } = body || {};

  // Recover prior collected info from UI message history (client keeps tool outputs)
  const priorCollected = findCollectedInfoFromUI(messages) || createInitialState();

  const agent = createGenerativeRetailAgent(priorCollected);

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}

/**
 * Find the most recent collected info from UI message history.
 * This checks both retail_assistant and show_educational_content tool outputs,
 * as both can return collectedInfo (with educational context).
 */
function findCollectedInfoFromUI(uiMessages: any[]): CollectedInfo | null {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    const msg = uiMessages[i];
    const parts = msg?.parts;
    if (!Array.isArray(parts)) continue;
    
    // Check all parts for collectedInfo - can come from retail_assistant or show_educational_content
    for (const part of parts) {
      const output = part?.output || part?.result || part?.data;
      if (output?.collectedInfo) {
        const info = output.collectedInfo as CollectedInfo;
        // Log when we find educational context for debugging
        if (info.educationalContext) {
          console.log("[Route] Found educationalContext:", JSON.stringify(info.educationalContext));
        }
        return info;
      }
    }
  }
  return null;
}

