/**
 * Shopping Assistant API Route
 * 
 * This endpoint handles chat messages from users and returns product recommendations.
 * 
 * Key behaviors:
 * 1. CLARIFYING QUESTION LIMIT: The assistant will ask a maximum of 2 clarifying
 *    questions before proceeding to show products. This is enforced both in the
 *    Gemini prompt and deterministically here in the API handler.
 * 
 * 2. PRODUCT SOURCE: All product recommendations are sourced exclusively from
 *    the dummy catalog (products_dummy table). The knowledge base search
 *    functions only query from this table.
 * 
 * 3. INTENT PARSING: User messages are parsed by Gemini to extract search intent,
 *    confidence level, and determine the next action (ASK_FOLLOWUP, EDUCATE_THEN_SEARCH,
 *    or SEARCH_NOW).
 */

import { NextRequest, NextResponse } from "next/server";
import { parseUserIntent } from "@/lib/gemini";
import { searchProducts, getStatus } from "@/lib/knowledgeBase";
import { AssistantRequestBody, AssistantResponse, ProductCard, ChatMessage } from "@/lib/types";

// Force Node.js runtime (not Edge) for @google/genai compatibility
export const runtime = "nodejs";

// Maximum number of clarifying turns before forcing product recommendations.
// After this many ASK_FOLLOWUP responses, the API will override to EDUCATE_THEN_SEARCH.
const MAX_CLARIFYING_TURNS = 2;

/**
 * Count how many previous assistant turns were clarifying questions (ASK_FOLLOWUP mode).
 * We detect this by looking for assistant messages with ui.mode === "education" and no products.
 */
function countClarifyingTurns(history: ChatMessage[] | undefined): number {
  if (!history || history.length === 0) return 0;
  
  let clarifyingCount = 0;
  
  for (const msg of history) {
    // An assistant message that was a clarifying turn:
    // - role is "assistant"
    // - has ui.mode === "education" 
    // - has no products or empty products array
    if (
      msg.role === "assistant" &&
      msg.ui?.mode === "education" &&
      (!msg.products || msg.products.length === 0)
    ) {
      clarifyingCount++;
    }
  }
  
  return clarifyingCount;
}

/**
 * Extract price constraints from natural language query
 * Handles formats like: "under 50000", "below 5k", "above 10000", "around 30000 INR"
 */
function extractPriceFromQuery(query: string): { minPrice?: number; maxPrice?: number } {
  let minPrice: number | undefined;
  let maxPrice: number | undefined;

  // Normalize the query for matching
  const normalized = query.toLowerCase();

  // Match "under/below/max X" patterns (with optional INR/Rs/₹ and k/K suffix)
  const maxPricePatterns = [
    /(?:under|below|max|upto|up to|less than)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*)\s*(?:k|thousand)?/gi,
    /(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*)\s*(?:k|thousand)?\s*(?:max|or less)/gi,
  ];

  for (const pattern of maxPricePatterns) {
    const match = pattern.exec(normalized);
    if (match) {
      let value = match[1].replace(/,/g, "");
      // Handle "k" or "thousand" suffix
      if (/k|thousand/i.test(match[0])) {
        value = String(parseInt(value, 10) * 1000);
      }
      maxPrice = parseInt(value, 10);
      break;
    }
  }

  // Match "above/over/min X" patterns
  const minPricePatterns = [
    /(?:above|over|min|more than|from)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*)\s*(?:k|thousand)?/gi,
  ];

  for (const pattern of minPricePatterns) {
    const match = pattern.exec(normalized);
    if (match) {
      let value = match[1].replace(/,/g, "");
      if (/k|thousand/i.test(match[0])) {
        value = String(parseInt(value, 10) * 1000);
      }
      minPrice = parseInt(value, 10);
      break;
    }
  }

  // Also check for legacy Shopify syntax (backwards compatibility)
  const shopifyMaxMatch = query.match(/variants\.price:<(\d+)/);
  if (shopifyMaxMatch && !maxPrice) {
    maxPrice = parseInt(shopifyMaxMatch[1], 10);
  }
  const shopifyMinMatch = query.match(/variants\.price:>(\d+)/);
  if (shopifyMinMatch && !minPrice) {
    minPrice = parseInt(shopifyMinMatch[1], 10);
  }

  return { minPrice, maxPrice };
}

/**
 * Helper to perform product search with price extraction from intent query
 */
async function performProductSearch(
  intent: Awaited<ReturnType<typeof parseUserIntent>>["intent"],
  originalMessage: string
): Promise<{ products: ProductCard[]; searchError?: string }> {
  try {
    // Extract price constraints from the semantic query
    const { minPrice, maxPrice } = extractPriceFromQuery(intent.query);

    // Clean the query for semantic search
    // Remove any legacy Shopify-specific syntax and price mentions for cleaner embedding match
    const semanticQuery = intent.query
      .replace(/product_type:/gi, "")
      .replace(/vendor:/gi, "")
      .replace(/tag:/gi, "")
      .replace(/title:/gi, "")
      .replace(/variants\.price:[<>]\d+/gi, "")
      // Don't remove natural language price mentions - they can help with semantic matching
      .replace(/\s+/g, " ")
      .trim() || originalMessage.trim();

    console.log("[API] Semantic search query:", semanticQuery);
    if (minPrice || maxPrice) {
      console.log("[API] Price filters:", { minPrice, maxPrice });
    }

    const products = await searchProducts(semanticQuery, {
      limit: intent.first,
      minPrice,
      maxPrice,
      sortKey: intent.sortKey,
      reverse: intent.reverse,
    });

    return { products };
  } catch (error) {
    console.error("[API] Search error:", error);
    return {
      products: [],
      searchError: error instanceof Error ? error.message : "Search failed",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AssistantRequestBody;
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    console.log("[API] Processing message:", message);

    // Check if knowledge base is initialized
    const status = await getStatus();
    if (!status.initialized) {
      console.log("[API] Knowledge base not initialized");
      return NextResponse.json({
        assistantMessage: "The product catalog hasn't been synced yet. Please run a sync first by calling POST /api/sync.",
        ui: {
          layout: "grid",
          title: "Setup Required",
          mode: "education",
        },
        products: [],
        debug: {
          modelUsed: "none",
          shopifyQuery: "",
          fallbackReason: "Knowledge base not initialized",
          knowledgeBaseStatus: status,
        },
      } as AssistantResponse);
    }

    // Step 1: Parse user intent with Gemini (with fallback)
    // Pass full conversation history so Gemini can synthesize all gathered information
    const { intent, modelUsed, fallbackReason } = await parseUserIntent(message.trim(), body.history);

    console.log("[API] Intent parsed:", { 
      nextAction: intent.nextAction, 
      confidence: intent.confidence,
      modelUsed, 
      fallbackReason 
    });

    // Step 1.5: Enforce clarifying turn limit
    // Count how many clarifying questions we've already asked in this conversation
    const clarifyingTurnCount = countClarifyingTurns(body.history);
    let nextActionOverride: string | undefined;
    
    if (intent.nextAction === "ASK_FOLLOWUP" && clarifyingTurnCount >= MAX_CLARIFYING_TURNS) {
      // We've asked enough questions - force showing products
      // Use EDUCATE_THEN_SEARCH to still provide some guidance with products
      // unless confidence is very low, in which case we still show products but with education
      nextActionOverride = "EDUCATE_THEN_SEARCH";
      intent.nextAction = "EDUCATE_THEN_SEARCH";
      
      // Update the assistant message to acknowledge we're proceeding with recommendations
      if (!intent.educationSummary) {
        intent.educationSummary = "Based on what you've told me so far, here are some options that might work for you.";
      }
      
      console.log(`[API] Clarifying turn limit reached (${clarifyingTurnCount}/${MAX_CLARIFYING_TURNS}), forcing EDUCATE_THEN_SEARCH`);
    }

    // Step 2: Branch based on nextAction
    let products: ProductCard[] = [];
    let searchError: string | undefined;
    let assistantMessage: string;
    let uiMode: "education" | "shopping";

    switch (intent.nextAction) {
      case "ASK_FOLLOWUP": {
        // Don't search - ask clarifying question and provide education
        console.log("[API] ASK_FOLLOWUP mode - skipping product search");
        
        // Build message combining education + follow-up question
        const parts: string[] = [];
        if (intent.educationSummary) {
          parts.push(intent.educationSummary);
        }
        if (intent.followupQuestion) {
          parts.push(intent.followupQuestion);
        }
        
        assistantMessage = parts.length > 0 
          ? parts.join("\n\n")
          : "I'd love to help you find the right product! Could you tell me more about what you're looking for?";
        uiMode = "education";
        break;
      }
      
      case "EDUCATE_THEN_SEARCH": {
        // Search products but lead with educational content
        console.log("[API] EDUCATE_THEN_SEARCH mode - searching with education");
        
        const result = await performProductSearch(intent, message);
        products = result.products;
        searchError = result.searchError;
        
        // Build message with education first, then transition to products
        const parts: string[] = [];
        if (intent.educationSummary) {
          parts.push(intent.educationSummary);
        }
        
        if (searchError) {
          parts.push(`I had some trouble searching, but here's what I understood: ${intent.assistantMessage}`);
        } else if (products.length === 0) {
          parts.push("I couldn't find products matching your criteria, but you can try different keywords or browse our categories!");
        } else {
          parts.push(`Based on this, here are some options I'd suggest:`);
        }
        
        assistantMessage = parts.join("\n\n");
        uiMode = products.length > 0 ? "shopping" : "education";
        break;
      }
      
      case "SEARCH_NOW":
      default: {
        // Confident - just search and show products (original behavior)
        console.log("[API] SEARCH_NOW mode - direct product search");
        
        const result = await performProductSearch(intent, message);
        products = result.products;
        searchError = result.searchError;
        
        if (searchError) {
          assistantMessage = `I had trouble searching, but here's what I understood: ${intent.assistantMessage}`;
        } else if (products.length === 0) {
          assistantMessage = "I couldn't find any products matching your request. Try different keywords or browse our categories!";
        } else {
          // Optionally prepend a brief tip if we have educational content
          if (intent.educationSummary && intent.confidence < 0.9) {
            assistantMessage = `${intent.educationSummary}\n\n${intent.assistantMessage}`;
          } else {
            assistantMessage = intent.assistantMessage;
          }
        }
        uiMode = "shopping";
        break;
      }
    }

    // Step 3: Build response
    const response: AssistantResponse = {
      assistantMessage,
      ui: {
        layout: "grid",
        title: intent.uiTitle,
        mode: uiMode,
      },
      products,
      debug: {
        modelUsed,
        shopifyQuery: intent.query,
        intentRaw: intent,
        knowledgeBaseStatus: status,
        ...(fallbackReason && { fallbackReason }),
        ...(searchError && { searchError }),
        ...(intent.externalTopics?.length && { externalTopics: intent.externalTopics }),
        ...(nextActionOverride && { nextActionOverride, clarifyingTurnCount }),
      },
    };

    console.log(`[API] Returning ${products.length} products (mode: ${uiMode}, action: ${intent.nextAction})`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Unexpected error:", error);
    
    // Even on error, return a valid response structure
    const errorResponse: AssistantResponse = {
      assistantMessage: "I'm having some trouble right now. Please try again in a moment!",
      ui: {
        layout: "grid",
        title: "Error",
        mode: "education",
      },
      products: [],
      debug: {
        modelUsed: "error",
        shopifyQuery: "",
        fallbackReason: error instanceof Error ? error.message : "Unknown error",
      },
    };

    return NextResponse.json(errorResponse, { status: 200 });
  }
}
