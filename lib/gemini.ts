import { GoogleGenAI, Type } from "@google/genai";
import { SearchIntent, ChatMessage } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_MODEL_FALLBACK = process.env.GEMINI_MODEL_FALLBACK || "gemini-2.5-flash-lite";
const GEMINI_MODEL_EXPERIMENTAL = process.env.GEMINI_MODEL_EXPERIMENTAL || "";

// Simple in-memory cache for intent
interface CacheEntry {
  intent: SearchIntent;
  timestamp: number;
}

const intentCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Generate a cache key that incorporates both the current message and conversation history
 */
function generateCacheKey(message: string, history?: ChatMessage[]): string {
  const messagePart = message.toLowerCase().trim();
  if (!history || history.length === 0) {
    return messagePart;
  }
  // Include a hash of history content to differentiate same message with different context
  const historyHash = history
    .map((m) => `${m.role}:${m.content.slice(0, 50)}`)
    .join("|");
  return `${messagePart}||${historyHash}`;
}

function getFromCache(message: string, history?: ChatMessage[]): SearchIntent | null {
  const cacheKey = generateCacheKey(message, history);
  const entry = intentCache.get(cacheKey);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    intentCache.delete(cacheKey);
    return null;
  }
  
  return entry.intent;
}

function setCache(message: string, history: ChatMessage[] | undefined, intent: SearchIntent): void {
  const cacheKey = generateCacheKey(message, history);
  intentCache.set(cacheKey, { intent, timestamp: Date.now() });
}

// Build the model try list based on env vars
function getModelTryList(): string[] {
  const models: string[] = [];
  
  if (GEMINI_MODEL_EXPERIMENTAL) {
    models.push(GEMINI_MODEL_EXPERIMENTAL);
  }
  
  models.push(GEMINI_MODEL);
  models.push(GEMINI_MODEL_FALLBACK);
  
  return models;
}

// Schema for structured output
const searchIntentSchema = {
  type: Type.OBJECT,
  properties: {
    query: {
      type: Type.STRING,
      description: "A rich semantic search query synthesized from the ENTIRE conversation. Combine all gathered information: product category, purpose/use case, budget constraints, features, preferences. Example: 'camera travel vlogging lightweight compact 4K video under 50000 INR'. Do NOT use Shopify syntax - just natural language keywords and phrases that capture the full user intent. For price filters, append 'under X' or 'above X' in natural language.",
    },
    first: {
      type: Type.NUMBER,
      description: "Number of products to fetch (4-24, default 12)",
    },
    sortKey: {
      type: Type.STRING,
      enum: ["RELEVANCE", "BEST_SELLING", "PRICE", "CREATED_AT"],
      description: "How to sort results",
    },
    reverse: {
      type: Type.BOOLEAN,
      description: "Whether to reverse sort order. For PRICE: false=low-to-high, true=high-to-low. For CREATED_AT: true=newest first.",
    },
    uiTitle: {
      type: Type.STRING,
      description: "Title to show above product grid",
    },
    assistantMessage: {
      type: Type.STRING,
      description: "Friendly message to show user about what you found or the educational content when in discovery mode",
    },
    confidence: {
      type: Type.NUMBER,
      description: "0-1 confidence score. How confident are you that you can return good, relevant products right now? Low if query is vague, missing key details (size, budget, use case), or user seems to be researching rather than buying.",
    },
    nextAction: {
      type: Type.STRING,
      enum: ["ASK_FOLLOWUP", "EDUCATE_THEN_SEARCH", "SEARCH_NOW"],
      description: "What should happen next: ASK_FOLLOWUP (ask clarifying question, don't search yet), EDUCATE_THEN_SEARCH (provide education + show products), SEARCH_NOW (confident, just show products).",
    },
    followupQuestion: {
      type: Type.STRING,
      description: "A focused follow-up question to ask when confidence is low. Ask about missing details like size, budget, intended use, style preference, or brand preference.",
    },
    educationSummary: {
      type: Type.STRING,
      description: "A 1-3 sentence educational blurb helping the user understand how to think about this purchase category - materials, features, price-quality tradeoffs, things to consider.",
    },
    externalTopics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Optional list of 1-2 topics that could be looked up online to provide better guidance (e.g., 'running shoe cushioning types', 'laptop RAM requirements for coding').",
    },
  },
  required: ["query", "first", "sortKey", "reverse", "uiTitle", "assistantMessage", "confidence", "nextAction"],
};

const systemPrompt = `You are a knowledgeable shopping assistant that helps users find the right products. Your goal is to GUIDE users to make informed decisions, not just show products immediately.

CORE PHILOSOPHY:
- Be a helpful advisor, not just a search engine
- When users are vague or researching, ASK questions and EDUCATE before showing products
- When users know exactly what they want, show products immediately
- Help users understand tradeoffs, materials, features, and what matters for their use case

CRITICAL - CONVERSATION HISTORY & SEARCH QUERY:
- You will receive the FULL conversation history, not just the latest message
- When generating the search query, you MUST synthesize ALL information gathered throughout the conversation
- Extract and combine: product category, purpose/use case, budget, features, preferences, brand requirements
- The search query should be a rich semantic description capturing the COMPLETE user intent
- Example: If user said "I need a camera", then answered "travel vlogging" for use case, and "under 50k" for budget, the query should be: "camera travel vlogging lightweight compact video recording under 50000 INR"
- NEVER just use the last message as the query - always synthesize the full context

IMPORTANT - CLARIFYING QUESTION LIMIT:
- Ask a MAXIMUM of 2 clarifying questions in a conversation before showing products
- After 2 follow-up questions, you MUST proceed to show products with your best-guess understanding
- Prefer EDUCATE_THEN_SEARCH (show products with educational context) over endless clarification
- Only ask additional questions after 2 turns in extremely rare cases where intent is totally unclear
- The goal is to help users quickly, not interrogate them

CONFIDENCE & NEXT ACTION RULES:
1. Set confidence LOW (0.0-0.4) and nextAction: "ASK_FOLLOWUP" when:
   - Query is very vague (e.g., "shoes", "laptop", "something nice")
   - Missing critical details (size, budget, use case, style)
   - User seems to be browsing/researching, not buying
   - Category has important tradeoffs user should understand first
   - BUT: If conversation already has 2+ back-and-forth turns, prefer "EDUCATE_THEN_SEARCH" instead
   
2. Set confidence MEDIUM (0.4-0.7) and nextAction: "EDUCATE_THEN_SEARCH" when:
   - Query has some specifics but could benefit from guidance
   - User might not know about important considerations
   - You can provide helpful context alongside products
   - User has answered some clarifying questions already
   
3. Set confidence HIGH (0.7-1.0) and nextAction: "SEARCH_NOW" when:
   - User knows exactly what they want (specific brand, model, features)
   - Query includes clear constraints (price, size, color)
   - User says "show me" or "find me" with specific requirements
   - Repeat query after already discussing the category

FOLLOW-UP QUESTIONS:
- Ask ONE focused question at a time (never multiple questions)
- Focus on: intended use, budget range, size/fit needs, style preferences, must-have features
- Make questions conversational, not robotic
- Limit yourself to 2 clarifying questions maximum per conversation
- Example: "Are you looking for running shoes for daily training, or something for races and speed work?"

EDUCATIONAL CONTENT:
- Keep it brief (1-3 sentences)
- Focus on practical, actionable insights
- Explain tradeoffs (comfort vs style, durability vs price, etc.)
- Mention what features matter most for different use cases
- Example: "Running shoes vary a lot based on your running style. Neutral shoes work for most runners, but if you overpronate, stability shoes can prevent injury."

EXTERNAL TOPICS:
- Suggest 1-2 specific topics that could be researched online for better guidance
- Make them specific and actionable (not generic)
- Example: ["best cushioning technology for marathon running", "leather vs synthetic hiking boots durability"]

SEARCH QUERY RULES:
1. The query is used for SEMANTIC SEARCH (vector similarity), not Shopify API
2. Synthesize a rich, descriptive query from the ENTIRE conversation:
   - Include: product type, use case, features, style, brand preferences
   - Include budget in natural language: "under 50000 INR", "budget friendly", "premium"
   - Example good query: "mirrorless camera travel vlogging lightweight 4K video stabilization under 80000 INR"
   - Example bad query: "under 50k" (missing context from earlier in conversation)
3. Budget interpretation (INR):
   - "under 5k" or "below 5000" → include "under 5000 INR" or "budget" in query
   - "around X" → include "around X INR" in query
4. Sorting:
   - "cheap" or "budget" → sortKey: "PRICE", reverse: false
   - "expensive" or "premium" → sortKey: "PRICE", reverse: true
   - "latest" or "newest" → sortKey: "CREATED_AT", reverse: true
   - "best selling" or "popular" → sortKey: "BEST_SELLING", reverse: false
   - Default: "RELEVANCE", reverse: false
5. first: 12 default, 4-24 range
6. uiTitle: Descriptive and friendly
7. assistantMessage: Conversational, include educational content when nextAction is EDUCATE_THEN_SEARCH`;

export interface ParseIntentResult {
  intent: SearchIntent;
  modelUsed: string;
  fallbackReason?: string;
}

/**
 * Build conversation contents for Gemini from history + current message
 */
function buildConversationContents(
  message: string,
  history?: ChatMessage[]
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  // Add history messages if present
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        // Gemini uses "model" instead of "assistant"
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add the current message
  contents.push({
    role: "user",
    parts: [{ text: message }],
  });

  return contents;
}

/**
 * Build a fallback query by synthesizing context from history
 */
function buildFallbackQuery(message: string, history?: ChatMessage[]): string {
  if (!history || history.length === 0) {
    return message.trim();
  }

  // Extract user messages from history and combine with current message
  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  userMessages.push(message);

  // Simple synthesis: join all user messages
  return userMessages.join(" ").trim();
}

export async function parseUserIntent(
  message: string,
  history?: ChatMessage[]
): Promise<ParseIntentResult> {
  // Check cache first
  const cached = getFromCache(message, history);
  if (cached) {
    console.log("[Gemini] Cache hit for:", message);
    return {
      intent: cached,
      modelUsed: "cache",
    };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const models = getModelTryList();

  // Build conversation contents with full history
  const contents = buildConversationContents(message, history);

  console.log(
    `[Gemini] Processing message with ${history?.length || 0} history messages`
  );

  let lastError: Error | null = null;

  for (const modelName of models) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: searchIntentSchema,
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      const intent = JSON.parse(text) as SearchIntent;

      // Validate and clamp first
      intent.first = Math.max(4, Math.min(24, intent.first || 12));

      // Validate sortKey
      const validSortKeys = ["RELEVANCE", "BEST_SELLING", "PRICE", "CREATED_AT"];
      if (!validSortKeys.includes(intent.sortKey)) {
        intent.sortKey = "RELEVANCE";
      }

      // Validate confidence (clamp to 0-1)
      intent.confidence = Math.max(0, Math.min(1, intent.confidence ?? 0.5));

      // Validate nextAction
      const validNextActions = [
        "ASK_FOLLOWUP",
        "EDUCATE_THEN_SEARCH",
        "SEARCH_NOW",
      ];
      if (!validNextActions.includes(intent.nextAction)) {
        intent.nextAction = "SEARCH_NOW";
      }

      // Cache the result
      setCache(message, history, intent);

      console.log(`[Gemini] Success with model: ${modelName}`, intent);

      return {
        intent,
        modelUsed: modelName,
      };
    } catch (error) {
      console.error(`[Gemini] Error with model ${modelName}:`, error);
      lastError = error as Error;
      continue;
    }
  }

  // All models failed - return fallback with synthesized query from history
  console.log("[Gemini] All models failed, using fallback");

  const fallbackQuery = buildFallbackQuery(message, history);

  const fallbackIntent: SearchIntent = {
    query: fallbackQuery,
    first: 12,
    sortKey: "RELEVANCE",
    reverse: false,
    uiTitle: "Results",
    assistantMessage: `Showing results for: "${fallbackQuery}"`,
    confidence: 0.5,
    nextAction: "SEARCH_NOW", // Default to showing products on fallback
  };

  return {
    intent: fallbackIntent,
    modelUsed: "fallback",
    fallbackReason: lastError?.message || "All Gemini models failed",
  };
}

