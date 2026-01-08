/**
 * Retail Assistant API Route
 * 
 * Uses ONLY actual DB columns:
 * - kb_embeddings: embedding_type, embedding_text, embedding (vector) - for semantic search
 * - kb_enriched_variants: use_cases (ARRAY), skill_level, price_tier, etc. - for structured matching
 * - latest_product: variants (jsonb for price), images (jsonb) - for product details
 * 
 * Tracks collected information across messages to ask clarifying questions
 */

import { NextRequest, NextResponse } from "next/server";
import { processMessage, CollectedInfo, createInitialState } from "@/lib/simpleAgent";
import { isSearchAvailable } from "@/lib/simpleSearch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, collectedInfo } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    console.log("[RetailAPI] Message:", message);
    console.log("[RetailAPI] Collected info:", JSON.stringify(collectedInfo));

    // Check if search is available
    const available = await isSearchAvailable();
    if (!available) {
      return NextResponse.json({
        assistantMessage: "The product search isn't available yet. Please make sure kb_embeddings table has data.",
        products: [],
        collectedInfo: createInitialState(),
        ui: { type: "recovery", chips: ["Try again"] },
      });
    }

    // Parse collected info from request
    const currentInfo: CollectedInfo | null = collectedInfo ? {
      use_case: collectedInfo.use_case ?? null,
      product_type: collectedInfo.product_type ?? null,
      price_min: collectedInfo.price_min ?? null,
      price_max: collectedInfo.price_max ?? null,
      skill_level: collectedInfo.skill_level ?? null,
      educationalContext: collectedInfo.educationalContext ?? null,
    } : null;

    // Process message with current collected info
    const response = await processMessage(message.trim(), currentInfo);

    // Convert products to UI format
    const products = response.products.map((p) => ({
      id: String(p.variantId),
      title: p.title,
      handle: p.handle,
      price: { amount: String(p.price), currencyCode: "INR" },
      image: { url: p.imageUrl || "/placeholder-product.svg", altText: p.title },
    }));

    return NextResponse.json({
      assistantMessage: response.message,
      products,
      collectedInfo: response.collectedInfo, // Return updated state
      ui: response.ui,
    });
  } catch (error) {
    console.error("[RetailAPI] Error:", error);

    return NextResponse.json({
      assistantMessage: "Something went wrong. Please try again.",
      products: [],
      collectedInfo: createInitialState(),
      ui: { type: "recovery", chips: ["Start over"] },
    });
  }
}
