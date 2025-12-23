import { GoogleGenAI } from "@google/genai";
import { adminGetAllProducts, type AdminProduct } from "@/lib/shopifyAdmin";
import type { ChatMessage } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// In-memory cache for products
let productCache: AdminProduct[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Baseline mode: Simple LLM prompt without schema rules
 * Returns plain text recommendations
 */
export async function baselineRecommend(messages: ChatMessage[]): Promise<string> {
  try {
    // Fetch products (with caching)
    if (!productCache || Date.now() - cacheTimestamp > CACHE_TTL) {
      console.log("[Baseline] Fetching products from Shopify");
      productCache = await adminGetAllProducts();
      cacheTimestamp = Date.now();
    }

    if (!productCache || productCache.length === 0) {
      return "I couldn't find any products in the catalog. Please try again later.";
    }

    // Prepare product data for LLM (limit to first 20 for context)
    const productsForContext = productCache.slice(0, 20).map((p) => ({
      id: p.id,
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      price: p.variants[0]?.price || "N/A",
      description: p.body_html?.substring(0, 200) || "No description",
      tags: p.tags || "",
    }));

    const userMessage = messages[messages.length - 1]?.content || "";

    const prompt = `You are a shopping assistant. Based on the user's request and the available products, provide helpful recommendations.

User request: ${userMessage}

Available products (showing first 20):
${JSON.stringify(productsForContext, null, 2)}

Please provide:
1. A friendly response addressing the user's request
2. Recommendations for 2-3 products that match their needs
3. Brief explanations for why each product might be suitable
4. Any relevant considerations or tradeoffs

Format your response as natural, conversational text. Do not use JSON or structured formats.`;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        temperature: 0.7,
      },
    });

    const text = response.text;
    return text || "I'm having trouble generating recommendations. Please try again.";
  } catch (error) {
    console.error("[Baseline] Error:", error);
    return `I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

