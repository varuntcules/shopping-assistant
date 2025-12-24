/**
 * Retail Assistant API Route
 * 
 * Voice-first retail shopping assistant for camera/creator gear
 * Uses conversation state management and Supabase product database
 */

import { NextRequest, NextResponse } from "next/server";
import { processRetailConversation, ConversationState } from "@/lib/retailAgent";
import { isRetailStoreInitialized } from "@/lib/retailVectorStore";
import { RetailAgentResponse, RetailConversationState, RetailProduct } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], conversationState } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    console.log("[RetailAPI] Processing message:", message);

    // Check if retail store is initialized
    const initialized = await isRetailStoreInitialized();
    if (!initialized) {
      return NextResponse.json({
        assistantMessage:
          "The product catalog hasn't been set up yet. Please ensure products_dummy, camera_specs, and lens_specs tables exist in Supabase.",
        state: {
          intent: null,
          primary_use: null,
          experience_level: null,
          budget_range: null,
          constraints_locked: false,
        },
        ui: {
          type: "recovery",
        },
        confidence: 0,
      } as RetailAgentResponse);
    }

    // Initialize or use existing state
    const currentState: ConversationState = conversationState || {
      intent: null,
      primary_use: null,
      experience_level: null,
      budget_range: null,
      constraints_locked: false,
    };

    // Process conversation
    const response = await processRetailConversation(
      message.trim(),
      currentState,
      history
    );

    // Convert RetailProduct to ProductCard format for UI compatibility
    const products = response.products?.map((p) => ({
      id: p.id,
      title: p.name,
      handle: p.id,
      vendor: "Retail Store",
      productType: p.category,
      price: {
        amount: String(p.price),
        currencyCode: p.currency || "INR",
      },
      image: {
        url: p.imageUrl || "/placeholder-product.svg",
        altText: p.name || null,
      },
      url: `#product-${p.id}`,
    })) || [];

    const retailResponse: RetailAgentResponse = {
      assistantMessage: response.message,
      state: response.state,
      products: response.products,
      ui: {
        type: response.ui.type,
        chips: response.ui.chips,
        comparison: response.ui.comparison ? {
          productA: response.products?.find(p => p.id === response.ui.comparison!.productAId)!,
          productB: response.products?.find(p => p.id === response.ui.comparison!.productBId)!,
          tradeoffs: response.ui.comparison.tradeoffs,
        } : undefined,
        checkout: response.ui.checkout ? {
          items: response.ui.checkout.itemIds
            .map(id => response.products?.find(p => p.id === id))
            .filter(Boolean) as RetailProduct[],
          total: response.ui.checkout.total,
        } : undefined,
      },
      confidence: response.confidence,
    };

    console.log(`[RetailAPI] Response type: ${response.ui.type}, Products: ${products.length}`);

    return NextResponse.json(retailResponse);
  } catch (error) {
    console.error("[RetailAPI] Error:", error);

    return NextResponse.json({
      assistantMessage:
        "I'm having some trouble right now. Could you try rephrasing that?",
      state: {
        intent: null,
        primary_use: null,
        experience_level: null,
        budget_range: null,
        constraints_locked: false,
      },
      ui: {
        type: "recovery",
      },
      confidence: 0,
    } as RetailAgentResponse);
  }
}
