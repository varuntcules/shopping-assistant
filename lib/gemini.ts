import { GoogleGenAI, Type } from "@google/genai";
import { SearchIntent } from "./types";

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

function getFromCache(message: string): SearchIntent | null {
  const entry = intentCache.get(message.toLowerCase().trim());
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    intentCache.delete(message.toLowerCase().trim());
    return null;
  }
  
  return entry.intent;
}

function setCache(message: string, intent: SearchIntent): void {
  intentCache.set(message.toLowerCase().trim(), { intent, timestamp: Date.now() });
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
      description: "Shopify search query syntax. Use filters like title:, tag:, vendor:, product_type:, variants.price:<X for price filters. Keep it short and robust.",
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

CONFIDENCE & NEXT ACTION RULES:
1. Set confidence LOW (0.0-0.4) and nextAction: "ASK_FOLLOWUP" when:
   - Query is very vague (e.g., "shoes", "laptop", "something nice")
   - Missing critical details (size, budget, use case, style)
   - User seems to be browsing/researching, not buying
   - Category has important tradeoffs user should understand first
   
2. Set confidence MEDIUM (0.4-0.7) and nextAction: "EDUCATE_THEN_SEARCH" when:
   - Query has some specifics but could benefit from guidance
   - User might not know about important considerations
   - You can provide helpful context alongside products
   
3. Set confidence HIGH (0.7-1.0) and nextAction: "SEARCH_NOW" when:
   - User knows exactly what they want (specific brand, model, features)
   - Query includes clear constraints (price, size, color)
   - User says "show me" or "find me" with specific requirements
   - Repeat query after already discussing the category

FOLLOW-UP QUESTIONS:
- Ask ONE focused question at a time
- Focus on: intended use, budget range, size/fit needs, style preferences, must-have features
- Make questions conversational, not robotic
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
1. Budget interpretation (INR):
   - "under 5k" or "below 5000" → use variants.price:<5000
   - "under 10,000" or "below 10000" → use variants.price:<10000
   - "around X" → use variants.price:<X+20% as a rough upper bound
2. Sorting:
   - "cheap" or "budget" → sortKey: "PRICE", reverse: false
   - "expensive" or "premium" → sortKey: "PRICE", reverse: true
   - "latest" or "newest" → sortKey: "CREATED_AT", reverse: true
   - "best selling" or "popular" → sortKey: "BEST_SELLING", reverse: false
   - Default: "RELEVANCE", reverse: false
3. Query syntax:
   - Use: title:, tag:, vendor:, product_type:, variants.price:
   - Keep queries short and focused
4. first: 12 default, 4-24 range
5. uiTitle: Descriptive and friendly
6. assistantMessage: Conversational, include educational content when nextAction is EDUCATE_THEN_SEARCH`;

export interface ParseIntentResult {
  intent: SearchIntent;
  modelUsed: string;
  fallbackReason?: string;
}

export async function parseUserIntent(message: string): Promise<ParseIntentResult> {
  // Check cache first
  const cached = getFromCache(message);
  if (cached) {
    console.log("[Gemini] Cache hit for:", message);
    return {
      intent: cached,
      modelUsed: "cache",
    };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const models = getModelTryList();
  
  let lastError: Error | null = null;
  
  for (const modelName of models) {
    try {
      console.log(`[Gemini] Trying model: ${modelName}`);
      
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
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
      const validNextActions = ["ASK_FOLLOWUP", "EDUCATE_THEN_SEARCH", "SEARCH_NOW"];
      if (!validNextActions.includes(intent.nextAction)) {
        intent.nextAction = "SEARCH_NOW";
      }
      
      // Cache the result
      setCache(message, intent);
      
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

  // All models failed - return fallback
  console.log("[Gemini] All models failed, using fallback");
  
  const fallbackIntent: SearchIntent = {
    query: message.trim(),
    first: 12,
    sortKey: "RELEVANCE",
    reverse: false,
    uiTitle: "Results",
    assistantMessage: `Showing results for: "${message}"`,
    confidence: 0.5,
    nextAction: "SEARCH_NOW", // Default to showing products on fallback
  };

  return {
    intent: fallbackIntent,
    modelUsed: "fallback",
    fallbackReason: lastError?.message || "All Gemini models failed",
  };
}

