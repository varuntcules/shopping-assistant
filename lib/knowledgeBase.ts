/**
 * Knowledge Base Module
 * 
 * This module provides the core product search and sync functionality for the
 * shopping assistant. 
 * 
 * IMPORTANT: All user-visible product recommendations are sourced exclusively
 * from the dummy catalog (products_dummy table in Supabase). This is intentional
 * for the current demo/development setup and ensures consistency across the
 * application.
 * 
 * The sync functions populate the dummy catalog from Shopify Admin API, and
 * the search functions query only from this dummy catalog.
 */

import { adminGetAllProducts, type ShopifyAdminProduct } from "./shopifyAdmin";
import { enrichProducts, type EnrichedProduct } from "./productEnricher";
import { generateEmbedding, generateEmbeddingsBatch, createProductEmbeddingText } from "./embeddings";
import {
  upsertProducts,
  searchByVector,
  toProductRecords,
  getProductCount,
  isInitialized,
  type ProductRecord,
} from "./vectorStore";
import { ProductCard } from "./types";

export interface SyncResult {
  success: boolean;
  productsProcessed: number;
  productsIndexed: number;
  durationMs: number;
  error?: string;
}

export interface SearchOptions {
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  sortKey?: "RELEVANCE" | "BEST_SELLING" | "PRICE" | "CREATED_AT";
  reverse?: boolean;
}

/**
 * Sync all products from Shopify Admin API to the knowledge base
 */
export async function syncProducts(): Promise<SyncResult> {
  const startTime = Date.now();
  
  try {
    console.log("[KnowledgeBase] Starting product sync...");
    
    // Step 1: Fetch all products from Admin API
    console.log("[KnowledgeBase] Fetching products from Shopify Admin API...");
    const shopifyProducts = await adminGetAllProducts();
    console.log(`[KnowledgeBase] Fetched ${shopifyProducts.length} products`);
    
    if (shopifyProducts.length === 0) {
      return {
        success: true,
        productsProcessed: 0,
        productsIndexed: 0,
        durationMs: Date.now() - startTime,
      };
    }
    
    // Step 2: Enrich products with smart tags
    console.log("[KnowledgeBase] Enriching products with smart tags...");
    const enrichedProducts = await enrichProducts(shopifyProducts);
    console.log(`[KnowledgeBase] Enriched ${enrichedProducts.length} products`);
    
    // Step 3: Create embedding texts
    console.log("[KnowledgeBase] Creating embedding texts...");
    const embeddingTexts = enrichedProducts.map((p) =>
      createProductEmbeddingText({
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.allTags,
        description: p.description,
      })
    );
    
    // Step 4: Generate embeddings
    console.log("[KnowledgeBase] Generating embeddings...");
    const embeddings = await generateEmbeddingsBatch(embeddingTexts);
    console.log(`[KnowledgeBase] Generated ${embeddings.length} embeddings`);
    
    // Step 5: Convert to records and upsert
    console.log("[KnowledgeBase] Upserting to vector store...");
    const records = toProductRecords(enrichedProducts, embeddings, embeddingTexts);
    await upsertProducts(records);
    
    const durationMs = Date.now() - startTime;
    console.log(`[KnowledgeBase] Sync complete in ${durationMs}ms`);
    
    return {
      success: true,
      productsProcessed: shopifyProducts.length,
      productsIndexed: records.length,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("[KnowledgeBase] Sync error:", error);
    
    return {
      success: false,
      productsProcessed: 0,
      productsIndexed: 0,
      durationMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Convert ProductRecord to ProductCard for UI
 */
function recordToProductCard(record: ProductRecord, storeDomain: string): ProductCard {
  return {
    id: record.id,
    title: record.title,
    handle: record.handle,
    vendor: record.vendor,
    productType: record.productType,
    price: {
      amount: String(record.price),
      currencyCode: record.currency,
    },
    image: {
      url: record.imageUrl || "/placeholder-product.svg",
      altText: record.imageAlt || null, // Convert empty string back to null for UI
    },
    url: `https://${storeDomain}/products/${record.handle}`,
  };
}

/**
 * Search products in the knowledge base using semantic search.
 * 
 * NOTE: Products are sourced exclusively from the dummy catalog (products_dummy).
 * This is the primary search endpoint used by the /api/assistant route.
 */
export async function searchProducts(
  query: string,
  options: SearchOptions = {}
): Promise<ProductCard[]> {
  const { limit = 12, minPrice, maxPrice, sortKey = "RELEVANCE", reverse = false } = options;

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN || "";

  // Check if knowledge base is initialized
  const initialized = await isInitialized();
  if (!initialized) {
    console.log("[KnowledgeBase] Not initialized, returning empty results");
    return [];
  }

  try {
    // Generate embedding for the query
    console.log(`[KnowledgeBase] Searching for: "${query}"`);
    const queryVector = await generateEmbedding(query);

    // Search vector store
    const records = await searchByVector(queryVector, {
      limit: limit * 2, // Fetch extra for sorting
      minPrice,
      maxPrice,
    });

    console.log(`[KnowledgeBase] Found ${records.length} results`);

    // -----------------------------
    // Re-ranking with keyword boost
    // -----------------------------

    // Basic tokenization of the original query for lexical matching
    const rawTokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length > 2); // ignore very short tokens like "a", "to"

    const uniqueTokens = Array.from(new Set(rawTokens));

    const scored = records.map((record, index) => {
      // Build a consolidated searchable text for the record
      const haystack = [
        record.title,
        record.vendor,
        record.productType,
        record.description,
        record.allTags,
        record.embeddingText,
      ]
        .join(" | ")
        .toLowerCase();

      // Count how many distinct query tokens appear in the product text
      let lexicalScore = 0;
      for (const token of uniqueTokens) {
        if (!token) continue;
        if (haystack.includes(token)) {
          lexicalScore += 1;
        }
      }

      return { record, index, lexicalScore };
    });

    // Sort by:
    // 1) lexicalScore (desc) – more exact keyword overlap first
    // 2) original index (asc) – preserve semantic similarity order as tie-breaker
    scored.sort((a, b) => {
      if (a.lexicalScore === b.lexicalScore) {
        return a.index - b.index;
      }
      return b.lexicalScore - a.lexicalScore;
    });

    // Convert to ProductCards
    let products = scored.map(({ record }) => recordToProductCard(record, storeDomain));

    // Apply additional sorting if explicitly requested
    if (sortKey === "PRICE") {
      products.sort((a, b) => {
        const priceA = parseFloat(a.price.amount);
        const priceB = parseFloat(b.price.amount);
        return reverse ? priceB - priceA : priceA - priceB;
      });
    }
    // For RELEVANCE, BEST_SELLING, CREATED_AT – keep re-ranked order

    // Apply limit after re-ranking
    return products.slice(0, limit);
  } catch (error) {
    console.error("[KnowledgeBase] Search error:", error);
    return [];
  }
}

/**
 * Get knowledge base status
 */
export async function getStatus(): Promise<{
  initialized: boolean;
  productCount: number;
}> {
  const [initialized, productCount] = await Promise.all([
    isInitialized(),
    getProductCount(),
  ]);
  
  return { initialized, productCount };
}

