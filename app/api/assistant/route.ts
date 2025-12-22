import { NextRequest, NextResponse } from "next/server";
import { parseUserIntent } from "@/lib/gemini";
import { searchProducts, getStatus } from "@/lib/knowledgeBase";
import { AssistantRequestBody, AssistantResponse, ProductCard } from "@/lib/types";

// Force Node.js runtime (not Edge) for @google/genai compatibility
export const runtime = "nodejs";

/**
 * Helper to perform product search with price extraction from intent query
 */
async function performProductSearch(
  intent: Awaited<ReturnType<typeof parseUserIntent>>["intent"],
  originalMessage: string
): Promise<{ products: ProductCard[]; searchError?: string }> {
  try {
    // Extract price constraints from intent query if present
    let minPrice: number | undefined;
    let maxPrice: number | undefined;
    
    // Parse price filters from the query (e.g., "variants.price:<5000")
    const priceMatch = intent.query.match(/variants\.price:<(\d+)/);
    if (priceMatch) {
      maxPrice = parseInt(priceMatch[1], 10);
    }
    const priceMinMatch = intent.query.match(/variants\.price:>(\d+)/);
    if (priceMinMatch) {
      minPrice = parseInt(priceMinMatch[1], 10);
    }
    
    // Use the full query for semantic search (the knowledge base will handle it)
    // Remove Shopify-specific syntax for better semantic matching
    const semanticQuery = intent.query
      .replace(/product_type:/gi, "")
      .replace(/vendor:/gi, "")
      .replace(/tag:/gi, "")
      .replace(/title:/gi, "")
      .replace(/variants\.price:[<>]\d+/gi, "")
      .replace(/\s+/g, " ")
      .trim() || originalMessage.trim();
    
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
    const { intent, modelUsed, fallbackReason } = await parseUserIntent(message.trim());

    console.log("[API] Intent parsed:", { 
      nextAction: intent.nextAction, 
      confidence: intent.confidence,
      modelUsed, 
      fallbackReason 
    });

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
