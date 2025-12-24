/**
 * Voice-First Retail Shopping Agent
 * 
 * Implements a conversational shopping agent for camera/photo/video gear that:
 * - Maintains conversation state
 * - Asks ONE question at a time
 * - Fetches products only from Supabase (camera_specs, lens_specs, products_dummy)
 * - Provides warm, helpful, store-associate-like responses
 */

import { GoogleGenAI, Type } from "@google/genai";
import { generateEmbedding } from "./embeddings";
import { searchRetailProducts, RetailProduct } from "./retailVectorStore";
import { ChatMessage } from "./types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const GEMINI_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_FALLBACK || "gemini-2.5-flash";
const GEMINI_MODEL_EXPERIMENTAL =
  process.env.GEMINI_MODEL_EXPERIMENTAL || "";

// Build the model try list based on env vars (best -> cheaper -> lite)
function getGeminiModelList(): string[] {
  const models: string[] = [];

  if (GEMINI_MODEL_EXPERIMENTAL) {
    models.push(GEMINI_MODEL_EXPERIMENTAL);
  }

  models.push(GEMINI_MODEL);
  models.push(GEMINI_MODEL_FALLBACK);

  // Ensure flash-lite is included as a last-resort option if not already present
  if (!models.includes("gemini-2.5-flash-lite")) {
    models.push("gemini-2.5-flash-lite");
  }

  return models;
}

// ============================================================================
// CONVERSATION STATE
// ============================================================================

export interface ConversationState {
  intent: string | null; // "travel_vlogging" | "solo_creator" | "hybrid_photo_video" | "photography" | "video" | null
  primary_use: string | null; // Natural language description
  experience_level: string | null; // "beginner" | "intermediate" | "advanced" | null
  budget_range: string | null; // e.g., "20000-50000" or "under 30000"
  constraints_locked: boolean; // Only true when we have enough info to recommend
}

export interface AgentResponse {
  message: string;
  state: ConversationState;
  products?: RetailProduct[];
  ui: {
    type: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
    chips?: string[]; // Quick selection buttons
    comparison?: {
      productAId: string;
      productBId: string;
      tradeoffs: string[];
    };
    checkout?: {
      itemIds: string[];
      total: number;
    };
  };
  shouldFetchProducts: boolean;
  confidence: number; // 0-1 confidence score based on state completeness
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

/**
 * Calculate confidence score (0-1) based on conversation state completeness
 * - intent set: +0.3
 * - primary_use OR experience_level set: +0.3
 * - budget_range set: +0.4
 */
function calculateConfidence(state: ConversationState): number {
  let confidence = 0;
  
  if (state.intent) {
    confidence += 0.3;
  }
  
  if (state.primary_use || state.experience_level) {
    confidence += 0.3;
  }
  
  if (state.budget_range) {
    confidence += 0.4;
  }
  
  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Parse a budget string into numeric min/max price filters
 */
function parseBudgetRange(
  budget: string | null | undefined
): { minPrice?: number; maxPrice?: number } {
  if (!budget) return {};

  // Normalize
  const normalized = budget.replace(/,/g, "").toLowerCase();

  // Range: 20000-50000 or 20000 to 50000
  const rangeMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)/
  );
  if (rangeMatch) {
    const minPrice = parseFloat(rangeMatch[1]);
    const maxPrice = parseFloat(rangeMatch[2]);
    if (!Number.isNaN(minPrice) && !Number.isNaN(maxPrice)) {
      return { minPrice, maxPrice };
    }
  }

  // Under/below/upto
  const underMatch = normalized.match(
    /(under|below|upto|max)\s*(?:rs\\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/
  );
  if (underMatch) {
    const maxPrice = parseFloat(underMatch[2]);
    if (!Number.isNaN(maxPrice)) {
      return { maxPrice };
    }
  }

  // Above/over/min
  const overMatch = normalized.match(
    /(above|over|min)\s*(?:rs\\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/
  );
  if (overMatch) {
    const minPrice = parseFloat(overMatch[2]);
    if (!Number.isNaN(minPrice)) {
      return { minPrice };
    }
  }

  // Single number fallback (treat as max)
  const numberMatch = normalized.match(/(?:rs\\.?|inr|₹)?\s*(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const maxPrice = parseFloat(numberMatch[1]);
    if (!Number.isNaN(maxPrice)) {
      return { maxPrice };
    }
  }

  return {};
}

/**
 * Heuristic price filters when budget is absent, based on experience level.
 */
function deriveExperiencePriceFilters(
  experience: string | null | undefined
): { minPrice?: number; maxPrice?: number } {
  if (!experience) return {};
  const level = experience.toLowerCase();

  if (level.includes("beginner")) {
    return { maxPrice: 1200 };
  }

  if (level.includes("intermediate")) {
    return { minPrice: 800, maxPrice: 2500 };
  }

  if (level.includes("advanced")) {
    return { minPrice: 1500 };
  }

  return {};
}

/**
 * Count how many clarifying questions have been asked in the conversation history
 * A clarifying question is an assistant message with ui.type === "question" and no products
 */
function countClarifyingQuestions(history: ChatMessage[]): number {
  if (!history || history.length === 0) return 0;
  
  let clarifyingCount = 0;
  
  for (const msg of history) {
    if (msg.role === "assistant") {
      // Check if this was a clarifying question
      // ui.type === "question" (from retailUI) and no products
      const retailUIType = msg.ui?.retailUI?.type;
      const isQuestionType = retailUIType === "question";
      const hasNoProducts = !msg.products || msg.products.length === 0;
      
      if (isQuestionType && hasNoProducts) {
        clarifyingCount++;
      } else if (!isQuestionType && hasNoProducts) {
        // Fallback heuristic: check if message seems like a question
        const isQuestion = /[?]|what|which|how|when|where|would you|could you|tell me/i.test(msg.content);
        const hasProducts = /\$\d+|₹\d+|price|product|recommend|here are|options|suggest/i.test(msg.content);
        
        if (isQuestion && !hasProducts) {
          clarifyingCount++;
        }
      }
    }
  }
  
  return clarifyingCount;
}

// ============================================================================
// GEMINI INTENT PARSING
// ============================================================================

const intentSchema = {
  type: Type.OBJECT,
  properties: {
    // State updates (update at most ONE field)
    updateIntent: { type: Type.STRING, description: "Update intent if clear from user message, or null" },
    updatePrimaryUse: { type: Type.STRING, description: "Update primary_use if clear, or null" },
    updateExperienceLevel: { type: Type.STRING, description: "Update experience_level if clear, or null" },
    updateBudgetRange: { type: Type.STRING, description: "Update budget_range if clear, or null" },
    
    // Response generation
    acknowledgment: { type: Type.STRING, description: "Acknowledge what the user said (warm, friendly)" },
    question: { type: Type.STRING, description: "ONE clarifying question to ask, or null if constraints are locked" },
    recommendation: { type: Type.STRING, description: "Recommendation explanation if constraints_locked, or null" },
    
    // UI hints
    uiType: {
      type: Type.STRING,
      enum: ["question", "recommendation", "comparison", "checkout", "confirmation", "recovery"],
      description: "Type of UI to show",
    },
    chips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Quick selection buttons (e.g., ['Travel vlogging', 'Solo creator', 'Hybrid'])",
    },
    
    // Product search hints
    shouldFetchProducts: { type: Type.BOOLEAN, description: "True if constraints are locked and we should fetch products" },
    searchQuery: { type: Type.STRING, description: "Semantic search query for products" },
    category: {
      type: Type.STRING,
      enum: ["camera", "lens", "microphone", "tripod", "stabilization", "all"],
      description: "Product category to search",
    },
    
    // Comparison (when user wants to compare products)
    comparison: {
      type: Type.OBJECT,
      properties: {
        productAId: { type: Type.STRING, description: "ID of first product to compare" },
        productBId: { type: Type.STRING, description: "ID of second product to compare" },
        tradeoffs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of trade-offs (e.g., 'A is lighter, B has better video quality')" },
      },
    },
    
    // Checkout (when user agrees to buy)
    checkout: {
      type: Type.OBJECT,
      properties: {
        itemIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "IDs of products to checkout" },
        total: { type: Type.NUMBER, description: "Total price in INR" },
      },
    },
  },
  required: ["acknowledgment", "uiType", "shouldFetchProducts"],
};

const systemPrompt = `You are a warm, helpful retail store associate helping customers find camera and creator gear. You sound friendly, conversational, and knowledgeable—like a real person in a store.

CONVERSATION STATE RULES:
- Maintain state: intent, primary_use, experience_level, budget_range, constraints_locked
- IMPORTANT: Update the relevant field based on user's response:
  - If user mentions intent/purpose (e.g., "travel photography", "vlogging") → update "updateIntent"
  - If user mentions use case details → update "updatePrimaryUse"
  - If user mentions experience (e.g., "beginner", "advanced") → update "updateExperienceLevel"  
  - If user mentions budget/price range (e.g., "under 50k", "1-2 lakh", "50000 to 100000") → update "updateBudgetRange"
- Only set constraints_locked = true when you have: intent AND (primary_use OR experience_level) AND budget_range
- When all three are present, set shouldFetchProducts = true

PERSONALITY:
- Warm, polite, conversational
- Always acknowledge what the user said before asking/responding
- Ask only ONE question at a time
- Never jump straight into products
- Avoid technical jargon unless asked
- Confident, calm, non-salesy

FLOW:
1. If state is incomplete → ask ONE clarifying question
2. If constraints_locked → fetch products and recommend
3. If user agrees to buy → show checkout
4. If no products found → recovery message with suggestions

OUTPUT:
- acknowledgment: Always acknowledge what user said (e.g., "Got it, you're looking for something for travel vlogging")
- question: ONE question if state incomplete, null if locked
- recommendation: When constraints_locked = true, provide a brief summary of what you understand and transition to showing products. DO NOT say "I'm looking for products" or "I'm searching" - just acknowledge what you understand and let the products speak for themselves. Example: "Perfect! Based on your needs for travel photography, lightweight kit, advanced experience, and budget up to 2 lakh INR, here are some great options:" or simply "Here are some options that match your needs:"
- uiType: Type of UI to show (use "recommendation" when showing products)
- chips: Quick selection buttons when asking questions
- shouldFetchProducts: Only true when constraints_locked = true

CRITICAL: When constraints_locked = true and you're showing products:
- DO NOT say "I'm looking for" or "I'm searching for" products
- DO NOT say "Let me find" or "I'll look for"
- Simply acknowledge what you understand and present the products directly
- Keep the recommendation message brief and transition smoothly to product display

Never expose internal reasoning. Behave like a real store associate.`;

export async function processRetailConversation(
  userMessage: string,
  currentState: ConversationState,
  conversationHistory: ChatMessage[] = []
): Promise<AgentResponse> {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Build context
    const historyText = conversationHistory
      .slice(-6) // Last 6 messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
    
    const prompt = `Current conversation state:
${JSON.stringify(currentState, null, 2)}

${historyText ? `Conversation history:\n${historyText}\n\n` : ""}User message: ${userMessage}

Analyze the message, update state (at most ONE field), and generate response:`;

    const models = getGeminiModelList();
    let parsed!: {
      updateIntent?: string;
      updatePrimaryUse?: string;
      updateExperienceLevel?: string;
      updateBudgetRange?: string;
      acknowledgment: string;
      question?: string;
      recommendation?: string;
      uiType: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
      chips?: string[];
      shouldFetchProducts: boolean;
      searchQuery?: string;
      category?: string;
      comparison?: {
        productAId: string;
        productBId: string;
        tradeoffs: string[];
      };
      checkout?: {
        itemIds: string[];
        total: number;
      };
    };
    let parsedSet = false;
    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        console.log(`[RetailAgent] Trying model: ${modelName}`);

        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: intentSchema,
            temperature: 0.7, // Slightly higher for more natural conversation
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response from Gemini");
        }

        parsed = JSON.parse(text) as typeof parsed;
        parsedSet = true;
        console.log(`[RetailAgent] Success with model: ${modelName}`);
        break;
      } catch (error) {
        console.error(`[RetailAgent] Error with model ${modelName}:`, error);
        lastError = error;
        continue;
      }
    }

    if (!parsedSet) {
      throw lastError || new Error("All Gemini models failed");
    }

    // Log Gemini response for debugging
    console.log("[RetailAgent] Gemini Response:", JSON.stringify(parsed, null, 2));
    console.log("[RetailAgent] Current State BEFORE update:", JSON.stringify(currentState, null, 2));

    // Update state (at most ONE field)
    const newState: ConversationState = { ...currentState };
    
    if (parsed.updateIntent && parsed.updateIntent !== "null") {
      newState.intent = parsed.updateIntent;
    }
    if (parsed.updatePrimaryUse && parsed.updatePrimaryUse !== "null") {
      newState.primary_use = parsed.updatePrimaryUse;
    }
    if (parsed.updateExperienceLevel && parsed.updateExperienceLevel !== "null") {
      newState.experience_level = parsed.updateExperienceLevel;
    }
    if (parsed.updateBudgetRange && parsed.updateBudgetRange !== "null") {
      newState.budget_range = parsed.updateBudgetRange;
    }
    
    // Fallback: Try to extract budget from user message if not set by Gemini
    if (!newState.budget_range) {
      const budgetMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:,\d+)*(?:\.\d+)?)|(?:under|below|max|upto)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*)|(?:above|over|min)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*)|(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*)/i);
      if (budgetMatch) {
        const extractedBudget = budgetMatch[0];
        newState.budget_range = extractedBudget;
        console.log(`[RetailAgent] Extracted budget from user message: ${extractedBudget}`);
      }
    }

    // Calculate confidence score
    const confidence = calculateConfidence(newState);
    
    // Log state after update
    console.log("[RetailAgent] State AFTER update:", JSON.stringify(newState, null, 2));
    console.log("[RetailAgent] Confidence:", confidence.toFixed(2));
    
    // Count clarifying questions
    const clarifyingCount = countClarifyingQuestions(conversationHistory);
    console.log("[RetailAgent] Clarifying questions count:", clarifyingCount);
    
    // Check if constraints should be locked
    const hasIntent = !!newState.intent;
    const hasUseOrExperience = !!(newState.primary_use || newState.experience_level);
    const hasBudget = !!newState.budget_range;
    
    console.log("[RetailAgent] State check - hasIntent:", hasIntent, "hasUseOrExperience:", hasUseOrExperience, "hasBudget:", hasBudget);
    
    // Enforce 2-question limit: if we've asked 2+ questions and confidence >= 0.6, force showing products
    const MAX_CLARIFYING_TURNS = 2;
    const CONFIDENCE_THRESHOLD = 0.6;
    let shouldForceProductDisplay = false;
    
    // Also check if confidence is very high (>= 0.8) - in this case, show products even if we haven't asked 2 questions
    const isHighConfidence = confidence >= 0.8;
    const shouldShowProducts = (clarifyingCount >= MAX_CLARIFYING_TURNS && confidence >= CONFIDENCE_THRESHOLD) || isHighConfidence;
    
    console.log("[RetailAgent] isHighConfidence:", isHighConfidence, "shouldShowProducts:", shouldShowProducts, "constraints_locked:", newState.constraints_locked);
    
    // If shouldShowProducts is true, force product display regardless of current constraints_locked state
    if (shouldShowProducts) {
      // Force constraints to be locked and show products
      newState.constraints_locked = true;
      parsed.shouldFetchProducts = true;
      parsed.uiType = "recommendation";
      shouldForceProductDisplay = true;
      
      // Build a comprehensive search query from the entire conversation
      const queryParts: string[] = [];
      if (newState.intent) queryParts.push(newState.intent);
      if (newState.primary_use) queryParts.push(newState.primary_use);
      if (newState.experience_level) queryParts.push(newState.experience_level);
      if (newState.budget_range) queryParts.push(newState.budget_range);
      
      // Also include the current user message and recent conversation context
      queryParts.push(userMessage);
      if (conversationHistory.length > 0) {
        const recentMessages = conversationHistory.slice(-4).map(msg => msg.content).join(" ");
        queryParts.push(recentMessages);
      }
      
      // Set the search query to a comprehensive description
      parsed.searchQuery = queryParts.join(" ").trim() || userMessage;
      
      // Update message to acknowledge we're proceeding
      if (!parsed.recommendation) {
        parsed.recommendation = "Based on what you've told me, here are some options that match your needs:";
      }
      
      console.log(`[RetailAgent] Forcing product display - clarifyingCount: ${clarifyingCount}, confidence: ${confidence.toFixed(2)}, isHighConfidence: ${isHighConfidence}`);
    } else if (hasIntent && hasUseOrExperience && hasBudget) {
      // Normal flow: lock constraints when we have all required info
      // This also triggers product fetch even if constraints were already locked
      newState.constraints_locked = true;
      parsed.shouldFetchProducts = true;
      shouldForceProductDisplay = true;
      
      // Build search query
      if (!parsed.searchQuery) {
        const queryParts: string[] = [];
        if (newState.intent) queryParts.push(newState.intent);
        if (newState.primary_use) queryParts.push(newState.primary_use);
        if (newState.experience_level) queryParts.push(newState.experience_level);
        if (newState.budget_range) queryParts.push(newState.budget_range);
        queryParts.push(userMessage);
        parsed.searchQuery = queryParts.join(" ").trim() || userMessage;
      }
      
      if (!parsed.recommendation) {
        parsed.recommendation = "Based on what you've told me, here are some options that match your needs:";
      }
      
      console.log(`[RetailAgent] All criteria met, forcing product display`);
    }
    
    // If constraints are locked but shouldFetchProducts is false, force it to true
    if (newState.constraints_locked && !parsed.shouldFetchProducts) {
      parsed.shouldFetchProducts = true;
      shouldForceProductDisplay = true;
      
      // Build search query if not set
      if (!parsed.searchQuery) {
        const queryParts: string[] = [];
        if (newState.intent) queryParts.push(newState.intent);
        if (newState.primary_use) queryParts.push(newState.primary_use);
        if (newState.experience_level) queryParts.push(newState.experience_level);
        if (newState.budget_range) queryParts.push(newState.budget_range);
        queryParts.push(userMessage);
        parsed.searchQuery = queryParts.join(" ").trim() || userMessage;
      }
      
      console.log(`[RetailAgent] Constraints locked, forcing shouldFetchProducts and shouldForceProductDisplay to true`);
    }

    // Build message
    const messageParts: string[] = [];
    if (parsed.acknowledgment) {
      messageParts.push(parsed.acknowledgment);
    }
    if (parsed.question && !newState.constraints_locked) {
      messageParts.push(parsed.question);
    }
    if (parsed.recommendation && newState.constraints_locked) {
      // Clean up any "looking for" or "searching" language from Gemini
      let recommendation = parsed.recommendation;
      // Remove phrases that suggest we're still searching
      recommendation = recommendation.replace(/I'm looking for|I'm searching for|I'll look for|Let me find|I'm finding/gi, "");
      recommendation = recommendation.replace(/\s+/g, " ").trim();
      messageParts.push(recommendation);
    }

    const message = messageParts.join(" ") || "I'd be happy to help you find the right gear!";

    // Fetch products if constraints are locked OR if confidence is high enough
    // Always fetch when constraints_locked is true, or when confidence >= threshold after 2+ questions
    let products: RetailProduct[] = [];
    const shouldFetch = newState.constraints_locked && (
      parsed.shouldFetchProducts || 
      shouldForceProductDisplay || 
      (clarifyingCount >= MAX_CLARIFYING_TURNS && confidence >= CONFIDENCE_THRESHOLD) ||
      confidence >= 0.8 // Very high confidence - always fetch
    );
    
    console.log(`[RetailAgent] shouldFetch: ${shouldFetch}, constraints_locked: ${newState.constraints_locked}, shouldForceProductDisplay: ${shouldForceProductDisplay}`);
    
    if (shouldFetch) {
      try {
        // Build search query from conversation context
        const searchQuery = parsed.searchQuery || (() => {
          // Build comprehensive query from state and conversation
          const queryParts: string[] = [];
          if (newState.intent) queryParts.push(newState.intent);
          if (newState.primary_use) queryParts.push(newState.primary_use);
          if (newState.experience_level) queryParts.push(newState.experience_level);
          if (newState.budget_range) queryParts.push(newState.budget_range);
          queryParts.push(userMessage);
          // Include recent conversation for context
          if (conversationHistory.length > 0) {
            const recentContext = conversationHistory.slice(-4).map(msg => msg.content).join(" ");
            queryParts.push(recentContext);
          }
          return queryParts.join(" ").trim() || userMessage;
        })();
        
        console.log(`[RetailAgent] Fetching products with query: "${searchQuery}"`);
        const queryVector = await generateEmbedding(searchQuery);
        const category = parsed.category || "all";
        const budgetFilters = parseBudgetRange(newState.budget_range);
        const experienceFilters = Object.keys(budgetFilters).length
          ? {}
          : deriveExperiencePriceFilters(newState.experience_level);
        const priceFilters =
          Object.keys(budgetFilters).length > 0 ? budgetFilters : experienceFilters;
        
        if (category === "all") {
          // Search multiple categories
          const categories: ("camera" | "lens" | "microphone" | "tripod" | "stabilization" | "other")[] = ["camera", "lens", "microphone"];
          for (const cat of categories) {
            const results = await searchRetailProducts(queryVector, {
              category: cat,
              limit: 3,
              ...priceFilters,
            });
            products.push(...results);
          }
        } else {
          products = await searchRetailProducts(queryVector, {
            category: category as "camera" | "lens" | "microphone" | "tripod" | "stabilization" | "other",
            limit: 6,
            ...priceFilters,
          });
        }
        
        console.log(`[RetailAgent] Found ${products.length} products`);

        // Deduplicate products by id to avoid repeats across category searches
        if (products.length > 1) {
          const seen = new Set<string>();
          products = products.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        }
      } catch (error) {
        console.error("[RetailAgent] Error fetching products:", error);
      }
    }

    // Build UI response
    // If we have products OR constraints are locked with high confidence, ensure UI type is "recommendation"
    const hasProductsToShow = products.length > 0;
    const shouldShowRecommendation = hasProductsToShow || 
      (newState.constraints_locked && (shouldForceProductDisplay || confidence >= 0.8));
    
    const uiResponse: AgentResponse["ui"] = {
      type: shouldShowRecommendation ? "recommendation" : (parsed.uiType || "question"),
      chips: parsed.chips || undefined,
    };
    
    // Log for debugging
    if (newState.constraints_locked && !hasProductsToShow) {
      console.warn(`[RetailAgent] Constraints locked but no products found. Confidence: ${confidence.toFixed(2)}, shouldFetch: ${shouldFetch}`);
    }

    // Handle comparison if products are available
    if (parsed.comparison && products.length >= 2) {
      const productA = products.find(p => p.id === parsed.comparison!.productAId) || products[0];
      const productB = products.find(p => p.id === parsed.comparison!.productBId) || products[1];
      
      uiResponse.comparison = {
        productAId: productA.id,
        productBId: productB.id,
        tradeoffs: parsed.comparison.tradeoffs || [],
      };
    }

    // Handle checkout
    if (parsed.checkout && products.length > 0) {
      const checkoutItems = parsed.checkout.itemIds
        ? products.filter(p => parsed.checkout!.itemIds.includes(p.id))
        : products.slice(0, 3); // Default to first 3 products
      
      const total = checkoutItems.reduce((sum, item) => sum + item.price, 0);
      
      uiResponse.checkout = {
        itemIds: checkoutItems.map(i => i.id),
        total: parsed.checkout.total || total,
      };
    }

    // Ensure products are returned if we have them and constraints are locked
    const finalProducts = (newState.constraints_locked && products.length > 0) ? products : undefined;
    
    // If constraints are locked but no products, log a warning
    if (newState.constraints_locked && products.length === 0) {
      console.warn(`[RetailAgent] Constraints locked but no products returned. Confidence: ${confidence.toFixed(2)}`);
    }
    
    const agentResponse: AgentResponse = {
      message,
      state: newState,
      products: finalProducts,
      ui: uiResponse,
      shouldFetchProducts: parsed.shouldFetchProducts || false,
      confidence,
    };
    
    // Log the final response
    console.log("[RetailAgent] Final Response:", JSON.stringify({
      message: agentResponse.message.substring(0, 100) + (agentResponse.message.length > 100 ? "..." : ""),
      state: agentResponse.state,
      productsCount: agentResponse.products?.length ?? 0,
      ui: agentResponse.ui,
      confidence: agentResponse.confidence,
    }, null, 2));
    
    return agentResponse;
  } catch (error) {
    console.error("[RetailAgent] Error:", error);
    
    // Fallback response
    return {
      message: "I'm having a bit of trouble right now. Could you tell me a bit more about what you're looking for?",
      state: currentState,
      ui: {
        type: "question",
      },
      shouldFetchProducts: false,
      confidence: calculateConfidence(currentState),
    };
  }
}

