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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

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
- Update at most ONE field per user message
- Only set constraints_locked = true when you have: intent AND (primary_use OR experience_level) AND budget_range
- Never fetch products until constraints_locked = true

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
- recommendation: Explanation if constraints locked, null otherwise
- uiType: Type of UI to show
- chips: Quick selection buttons when asking questions
- shouldFetchProducts: Only true when constraints_locked = true

Never expose internal reasoning. Behave like a real store associate.`;

export async function processRetailConversation(
  userMessage: string,
  currentState: ConversationState,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
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

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
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

    const parsed = JSON.parse(text) as any;

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

    // Check if constraints should be locked
    const hasIntent = !!newState.intent;
    const hasUseOrExperience = !!(newState.primary_use || newState.experience_level);
    const hasBudget = !!newState.budget_range;
    
    if (hasIntent && hasUseOrExperience && hasBudget && !newState.constraints_locked) {
      newState.constraints_locked = true;
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
      messageParts.push(parsed.recommendation);
    }

    const message = messageParts.join(" ") || "I'd be happy to help you find the right gear!";

    // Fetch products if constraints are locked
    let products: RetailProduct[] = [];
    if (newState.constraints_locked && parsed.shouldFetchProducts) {
      try {
        const queryVector = await generateEmbedding(parsed.searchQuery || userMessage);
        const category = parsed.category || "all";
        
        if (category === "all") {
          // Search multiple categories
          const categories = ["camera", "lens", "microphone"];
          for (const cat of categories) {
            const results = await searchRetailProducts(queryVector, {
              category: cat as any,
              limit: 3,
            });
            products.push(...results);
          }
        } else {
          products = await searchRetailProducts(queryVector, {
            category: category as any,
            limit: 6,
          });
        }
      } catch (error) {
        console.error("[RetailAgent] Error fetching products:", error);
      }
    }

    // Build UI response
    let uiResponse: AgentResponse["ui"] = {
      type: parsed.uiType || "question",
      chips: parsed.chips || undefined,
    };

    // Handle comparison if products are available
    if (parsed.comparison && products.length >= 2) {
      const productA = products.find(p => p.id === parsed.comparison.productAId) || products[0];
      const productB = products.find(p => p.id === parsed.comparison.productBId) || products[1];
      
      uiResponse.comparison = {
        productAId: productA.id,
        productBId: productB.id,
        tradeoffs: parsed.comparison.tradeoffs || [],
      };
    }

    // Handle checkout
    if (parsed.checkout && products.length > 0) {
      const checkoutItems = parsed.checkout.itemIds
        ? products.filter(p => parsed.checkout.itemIds.includes(p.id))
        : products.slice(0, 3); // Default to first 3 products
      
      const total = checkoutItems.reduce((sum, item) => sum + item.price, 0);
      
      uiResponse.checkout = {
        itemIds: checkoutItems.map(i => i.id),
        total: parsed.checkout.total || total,
      };
    }

    return {
      message,
      state: newState,
      products: products.length > 0 ? products : undefined,
      ui: uiResponse,
      shouldFetchProducts: parsed.shouldFetchProducts || false,
    };
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
    };
  }
}

