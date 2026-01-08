import { ToolLoopAgent, type InferAgentUIMessage, type ModelMessage, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  createInitialState,
  processMessage,
  type CollectedInfo,
  type SimpleAgentResponse,
} from "./simpleAgent";
import { getGenerativeUITools } from "./generativeUITools";

/**
 * Extract the latest collected info from previous tool calls in the message history.
 * Falls back to an empty state when none is found.
 */
function getLatestCollectedInfo(messages: ModelMessage[] | undefined): CollectedInfo {
  if (!messages || messages.length === 0) {
    return createInitialState();
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "tool") continue;

    const content = (message as any).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      const result = (part as any)?.result ?? (part as any)?.output ?? (part as any)?.data;
      if (result?.collectedInfo) {
        return result.collectedInfo as CollectedInfo;
      }
    }
  }

  return createInitialState();
}

function getLatestUserText(messages: ModelMessage[] | undefined): string | null {
  if (!messages) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    // ModelMessage.user content can be a string
    const content = (msg as any).content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }

    // Or an array of parts with text fields
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.text && typeof part.text === "string" && part.text.trim()) {
          return part.text.trim();
        }
      }
    }

    // Fallback: some providers surface "parts"
    const parts = (msg as any).parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.text && typeof part.text === "string" && part.text.trim()) {
          return part.text.trim();
        }
      }
    }
  }
  return null;
}

const modelId = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/**
 * Build a generative agent that can call multiple tools to design UI.
 * - Use retail_assistant to fetch products and collected info
 * - Use generative UI tools to render comparison, education, filters, questions, and grids
 */
export function createGenerativeRetailAgent(priorCollected: CollectedInfo | null = null) {
  const genTools = getGenerativeUITools(priorCollected);
  let retailCalled = false;
  let cachedResult: SimpleAgentResponse | null = null;

  return new ToolLoopAgent({
    model: google(modelId),
    instructions: `
You are a retail shopping copilot. Design the best UI for the user by calling tools.

CRITICAL RULES - PRIORITY ORDER:
1. CONCEPTUAL QUESTIONS (HIGHEST PRIORITY): If user asks a conceptual question (e.g., "what is X?", "how does X work?", "explain X", "what kind of X would be appropriate", "what sensor size would be appropriate"), you MUST prioritize education FIRST.
   - If the user's message contains BOTH shopping intent AND a conceptual question (e.g., "I'm a travel vlogger and need lightweight gear. What sensor size would be appropriate?"), call show_educational_content ONLY and STOP immediately. Do NOT call retail_assistant or ask_clarifying_question in the same turn.
   - If it's a pure educational question, call show_educational_content ONLY. Do NOT call retail_assistant.
   - Provide rich, detailed explanations with sections breaking down the concept (e.g., Full-Frame vs APS-C vs Micro Four Thirds with detailed descriptions).
   - When you show educational content, you MUST STOP and wait for the user's next message. The clarifying question about shopping details (budget, use case, etc.) should come in the NEXT turn after the user has seen the educational content.
   - IMPORTANT: When calling show_educational_content, ALWAYS include ALL relevant context parameters:
     * relatedUseCases: The use cases being discussed (e.g., ["travel vlogging", "low light photography"])
     * recommendedSensorSizes: If discussing cameras/sensors, list the recommended sensor sizes (e.g., ["APS-C", "Micro Four Thirds"] for lightweight travel, ["Full-Frame"] for studio work)
     * recommendedFeatures: Key features/attributes for the use case (e.g., ["lightweight", "portable", "compact lenses"] for travel, ["high resolution", "color accuracy"] for studio)
     
     Example for travel vlogging sensor question:
       relatedUseCases: ["travel vlogging", "low light photography"]
       recommendedSensorSizes: ["APS-C", "Micro Four Thirds"]
       recommendedFeatures: ["lightweight", "portable", "good autofocus", "flip screen"]
     
     This context is CRITICAL - when the user follows up with "show me lightweight options", the system uses these stored recommendations to search for the right products.

2. SHOPPING QUERIES: If user wants to find/buy products AND there is NO conceptual question in their message, call retail_assistant EXACTLY ONCE to get product data. NEVER call retail_assistant more than once per turn.

3. AFTER retail_assistant returns, IMMEDIATELY call ONE UI tool based on the result:
   - If retail_assistant returned products (products array is not empty), call show_product_grid with those products and STOP.
   - If retail_assistant returned no products and asked a question, call ask_clarifying_question and STOP.
   - DO NOT call retail_assistant again after it has been called once.

4. NEVER call retail_assistant twice in the same turn. If you already called it, use the result to call a UI tool.

5. NEVER call show_educational_content AND ask_clarifying_question in the same turn. Educational content must come first, then questions in the next turn.

6. Never invent answers to clarifying questions. If you ask, stop and wait for the user.

7. Do not re-ask questions already answered in priorCollected.

SEQUENCING RULE: When educational content is shown, the agent MUST STOP and not ask clarifying questions in the same turn. The clarifying question should come in the next turn after the user has absorbed the educational information.

CONTEXT PRESERVATION: The parameters in show_educational_content (relatedUseCases, recommendedSensorSizes, recommendedFeatures) are critical for context continuity. When users follow up after educational content:
- "Show me lightweight options" → system knows to search for cameras with APS-C/MFT sensors based on recommendedSensorSizes
- "APS-C makes sense, show me options" → system knows the use case from relatedUseCases
- "I want something portable" → system maps to recommendedFeatures discussed in education

IMPORTANT: Each turn should have at most TWO tool calls: retail_assistant (once) followed by ONE UI tool. If you've already called retail_assistant, DO NOT call it again - proceed directly to a UI tool.
`,
    stopWhen: stepCountIs(3), // retail_assistant + one UI tool max
    tools: {
      // Data tool: fetch products + state updates
      retail_assistant: {
        description:
          "Parses the user request, updates collected info, and returns product suggestions plus state. ONLY call this ONCE per turn - if you need to show UI, use the result from the first call.",
        parameters: z.object({
          message: z.string().describe("The latest raw user message"),
        }),
        execute: async (
          { message }: { message: string },
          { messages }: { messages: ModelMessage[] }
        ): Promise<SimpleAgentResponse> => {
          // If already called this turn, return cached result instead of error
          if (retailCalled && cachedResult) {
            console.log("[RetailAssistant] Returning cached result from earlier call");
            return cachedResult;
          }
          retailCalled = true;

          const priorState = priorCollected || getLatestCollectedInfo(messages);
          const userText = message?.trim() || getLatestUserText(messages) || "";

          if (!userText) {
            cachedResult = {
              message: "I didn't catch that. Could you repeat your request?",
              products: [],
              collectedInfo: priorState,
              ui: {
                type: "question",
                chips: [
                  "Travel vlogging",
                  "Studio photography",
                  "Wildlife photography",
                  "Events",
                  "Portrait photography",
                ],
              },
            };
            return cachedResult;
          }

          cachedResult = await processMessage(userText, priorState);
          return cachedResult;
        },
      },
      // Generative UI tools
      ...genTools,
    },
  });
}

export type GenerativeRetailUIMessage = InferAgentUIMessage<
  ReturnType<typeof createGenerativeRetailAgent>
>;

