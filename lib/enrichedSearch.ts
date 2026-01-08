/**
 * Enriched Search Service
 * 
 * Performs semantic search on kb_embeddings with priority-weighted field matching.
 * Uses pgvector cosine distance for similarity scoring.
 * 
 * Priority Weights:
 * - use_cases: 1.0 (highest)
 * - best_for: 0.7
 * - not_best_for, tradeoffs, ambiguity_triggers: 0.3
 */

import { Pool, PoolClient } from "pg";
import { generateEmbedding } from "./embeddings";

// Singleton connection pool
let pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.warn("[EnrichedSearch] DATABASE_URL not set.");
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DB_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function getClient(): Promise<PoolClient | null> {
  const p = getPool();
  if (!p) return null;
  return p.connect();
}

// Priority weights for each embedding type
const PRIORITY_WEIGHTS: Record<string, number> = {
  use_cases: 1.0,
  best_for: 0.7,
  not_best_for: 0.3,
  tradeoffs: 0.3,
  ambiguity_triggers: 0.3,
};

// Embedding type to search field mapping
type EmbeddingType = "use_cases" | "best_for" | "not_best_for" | "tradeoffs" | "ambiguity_triggers";

/**
 * Search parameters for enriched product search
 */
export interface EnrichedSearchParams {
  useCase?: string;
  bestFor?: string;
  budget?: { min?: number; max?: number };
  skillLevel?: "beginner" | "intermediate" | "pro" | "expert";
  portabilityPreference?: "portable" | "quality" | "balanced";
  priceTier?: "budget" | "low" | "mid" | "high" | "premium";
  limit?: number;
  minScore?: number;
}

/**
 * Enriched product result from search
 */
export interface EnrichedProduct {
  productId: number;
  variantId: number;
  title: string;
  handle: string;
  price: number;
  imageUrl: string | null;
  // Enriched fields
  useCases: string[];
  skillLevel: string | null;
  portabilityScore: number | null;
  priceTier: string | null;
  bestFor: string[];
  notBestFor: string[];
  tradeoffs: string[];
  ambiguityTriggers: string[];
  confidenceScore: number | null;
  // Search scoring
  matchScore: number;
  matchedFields: Record<string, { text: string; similarity: number }>;
}

/**
 * Search result with metadata
 */
export interface EnrichedSearchResult {
  products: EnrichedProduct[];
  totalMatches: number;
  searchParams: EnrichedSearchParams;
}

/**
 * Format embedding array for PostgreSQL vector type
 */
function formatEmbeddingForDB(embedding: number[]): string {
  return "[" + embedding.map((x) => x.toString()).join(",") + "]";
}

/**
 * Extract first variant's price from JSONB variants array
 */
function extractPriceFromVariants(variants: unknown): number {
  if (!variants || !Array.isArray(variants)) return 0;
  const firstVariant = variants[0];
  if (!firstVariant) return 0;
  const priceStr = firstVariant.price || firstVariant.variant_price || "0";
  return parseFloat(priceStr) || 0;
}

/**
 * Extract first image URL from JSONB images array
 */
function extractImageUrl(images: unknown): string | null {
  if (!images || !Array.isArray(images)) return null;
  const firstImage = images[0];
  if (!firstImage) return null;
  return firstImage.src || firstImage.url || null;
}

/**
 * Search a specific embedding type and return matches
 */
async function searchEmbeddingType(
  client: PoolClient,
  embeddingType: EmbeddingType,
  queryEmbedding: number[],
  minScore: number,
  limit: number
): Promise<Map<number, { similarity: number; text: string }>> {
  const embeddingStr = formatEmbeddingForDB(queryEmbedding);
  const weight = PRIORITY_WEIGHTS[embeddingType];

  const sql = `
    SELECT 
      ke.variant_id,
      ke.embedding_text,
      1.0 - (ke.embedding <=> $1::vector) as similarity
    FROM public.kb_embeddings ke
    WHERE ke.embedding_type = $2
    AND 1.0 - (ke.embedding <=> $1::vector) >= $3
    ORDER BY ke.embedding <=> $1::vector
    LIMIT $4
  `;

  try {
    const result = await client.query(sql, [embeddingStr, embeddingType, minScore, limit * 2]);
    const matches = new Map<number, { similarity: number; text: string }>();

    for (const row of result.rows) {
      const variantId = Number(row.variant_id);
      const similarity = parseFloat(row.similarity);
      const weightedScore = similarity * weight;

      // Keep best match per variant
      const existing = matches.get(variantId);
      if (!existing || weightedScore > existing.similarity * weight) {
        matches.set(variantId, {
          similarity,
          text: row.embedding_text,
        });
      }
    }

    return matches;
  } catch (error) {
    console.error(`[EnrichedSearch] Error searching ${embeddingType}:`, error);
    return new Map();
  }
}

/**
 * Perform enriched semantic search
 * 
 * Searches kb_embeddings with priority weights, joins with variant and product data,
 * and returns grouped results by product (best variant per product).
 */
export async function searchEnrichedProducts(
  params: EnrichedSearchParams
): Promise<EnrichedSearchResult> {
  const {
    useCase,
    bestFor,
    budget,
    skillLevel,
    portabilityPreference,
    priceTier,
    limit = 10,
    minScore = 0.5,
  } = params;

  const client = await getClient();
  if (!client) {
    console.warn("[EnrichedSearch] No database client available.");
    return { products: [], totalMatches: 0, searchParams: params };
  }

  try {
    // Generate embeddings for search queries
    const searchQueries: { type: EmbeddingType; query: string }[] = [];

    if (useCase) {
      searchQueries.push({ type: "use_cases", query: useCase });
    }
    if (bestFor) {
      searchQueries.push({ type: "best_for", query: bestFor });
    }

    // If no specific queries, we can't do semantic search
    if (searchQueries.length === 0) {
      console.log("[EnrichedSearch] No search queries provided, returning empty results");
      return { products: [], totalMatches: 0, searchParams: params };
    }

    // Collect matches across all field types
    const variantMatches = new Map<
      number,
      {
        fields: Record<string, { similarity: number; text: string }>;
        totalWeightedScore: number;
        totalWeight: number;
        matchCount: number;
      }
    >();

    // Search each query type
    for (const { type, query } of searchQueries) {
      console.log(`[EnrichedSearch] Generating embedding for ${type}: "${query}"`);
      const embedding = await generateEmbedding(query);
      const matches = await searchEmbeddingType(client, type, embedding, minScore, limit);

      const weight = PRIORITY_WEIGHTS[type];

      for (const [variantId, matchInfo] of Array.from(matches.entries())) {
        let variant = variantMatches.get(variantId);
        if (!variant) {
          variant = {
            fields: {},
            totalWeightedScore: 0,
            totalWeight: 0,
            matchCount: 0,
          };
          variantMatches.set(variantId, variant);
        }

        // Store match info
        variant.fields[type] = matchInfo;
        variant.totalWeightedScore += matchInfo.similarity * weight;
        variant.totalWeight += weight;
        variant.matchCount++;
      }
    }

    if (variantMatches.size === 0) {
      console.log("[EnrichedSearch] No matches found");
      return { products: [], totalMatches: 0, searchParams: params };
    }

    // Get variant IDs
    const variantIds = Array.from(variantMatches.keys());
    const placeholders = variantIds.map((_, i) => `$${i + 1}`).join(",");

    // Build WHERE clauses for filters
    const filterClauses: string[] = [];
    const filterParams: unknown[] = [...variantIds];
    let paramIndex = variantIds.length + 1;

    if (skillLevel) {
      filterClauses.push(`kev.skill_level = $${paramIndex}`);
      filterParams.push(skillLevel);
      paramIndex++;
    }

    if (priceTier) {
      filterClauses.push(`kev.price_tier = $${paramIndex}`);
      filterParams.push(priceTier);
      paramIndex++;
    }

    if (portabilityPreference) {
      // Map preference to portability score range
      // 1 = very portable, 5 = not portable
      if (portabilityPreference === "portable") {
        filterClauses.push(`kev.portability_score <= 2`);
      } else if (portabilityPreference === "quality") {
        filterClauses.push(`kev.portability_score >= 4`);
      }
      // "balanced" = no filter
    }

    const filterSql = filterClauses.length > 0 
      ? `AND ${filterClauses.join(" AND ")}` 
      : "";

    // Fetch variant details with product info
    const detailsSql = `
      SELECT 
        kev.variant_id,
        kev.product_id,
        kev.use_cases,
        kev.skill_level,
        kev.portability_score,
        kev.price_tier,
        kev.best_for,
        kev.not_best_for,
        kev.tradeoffs,
        kev.ambiguity_triggers,
        kev.confidence_score,
        lp.title,
        lp.handle,
        lp.variants as variants_json,
        lp.images as images_json
      FROM public.kb_enriched_variants kev
      LEFT JOIN public.latest_product lp ON kev.product_id = lp.id
      WHERE kev.variant_id IN (${placeholders})
      ${filterSql}
    `;

    const detailsResult = await client.query(detailsSql, filterParams);

    // Build enriched products
    const productMap = new Map<number, EnrichedProduct>();

    for (const row of detailsResult.rows) {
      const variantId = Number(row.variant_id);
      const productId = Number(row.product_id);
      const matchInfo = variantMatches.get(variantId);

      if (!matchInfo) continue;

      // Calculate final score
      const avgWeightedScore = matchInfo.totalWeight > 0
        ? matchInfo.totalWeightedScore / matchInfo.totalWeight
        : 0;
      
      // Bonus for matching multiple fields
      const matchBonus = 0.1 * Math.min(matchInfo.matchCount / searchQueries.length, 1.0);
      
      // Confidence score influence (10% weight)
      const confidence = row.confidence_score ?? 50;
      const confidenceFactor = (confidence / 100.0) * 0.1;
      
      const finalScore = Math.min(avgWeightedScore + matchBonus + confidenceFactor, 1.0);

      // Extract price from variants JSONB
      const price = extractPriceFromVariants(row.variants_json);

      // Apply budget filter
      if (budget) {
        if (budget.min !== undefined && price < budget.min) continue;
        if (budget.max !== undefined && price > budget.max) continue;
      }

      const enrichedProduct: EnrichedProduct = {
        productId,
        variantId,
        title: row.title || "",
        handle: row.handle || "",
        price,
        imageUrl: extractImageUrl(row.images_json),
        useCases: row.use_cases || [],
        skillLevel: row.skill_level,
        portabilityScore: row.portability_score,
        priceTier: row.price_tier,
        bestFor: row.best_for || [],
        notBestFor: row.not_best_for || [],
        tradeoffs: row.tradeoffs || [],
        ambiguityTriggers: row.ambiguity_triggers || [],
        confidenceScore: row.confidence_score,
        matchScore: finalScore,
        matchedFields: matchInfo.fields,
      };

      // Group by product_id, keep best variant
      const existing = productMap.get(productId);
      if (!existing || enrichedProduct.matchScore > existing.matchScore) {
        productMap.set(productId, enrichedProduct);
      }
    }

    // Sort by match score and limit
    const products = Array.from(productMap.values())
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    console.log(`[EnrichedSearch] Found ${products.length} products`);

    return {
      products,
      totalMatches: productMap.size,
      searchParams: params,
    };
  } catch (error) {
    console.error("[EnrichedSearch] Error:", error);
    return { products: [], totalMatches: 0, searchParams: params };
  } finally {
    client.release();
  }
}

/**
 * Get products by variant IDs (for direct lookup)
 */
export async function getEnrichedProductsByVariantIds(
  variantIds: number[]
): Promise<EnrichedProduct[]> {
  if (variantIds.length === 0) return [];

  const client = await getClient();
  if (!client) return [];

  try {
    const placeholders = variantIds.map((_, i) => `$${i + 1}`).join(",");
    
    const sql = `
      SELECT 
        kev.variant_id,
        kev.product_id,
        kev.use_cases,
        kev.skill_level,
        kev.portability_score,
        kev.price_tier,
        kev.best_for,
        kev.not_best_for,
        kev.tradeoffs,
        kev.ambiguity_triggers,
        kev.confidence_score,
        lp.title,
        lp.handle,
        lp.variants as variants_json,
        lp.images as images_json
      FROM public.kb_enriched_variants kev
      LEFT JOIN public.latest_product lp ON kev.product_id = lp.id
      WHERE kev.variant_id IN (${placeholders})
    `;

    const result = await client.query(sql, variantIds);

    return result.rows.map((row) => ({
      productId: Number(row.product_id),
      variantId: Number(row.variant_id),
      title: row.title || "",
      handle: row.handle || "",
      price: extractPriceFromVariants(row.variants_json),
      imageUrl: extractImageUrl(row.images_json),
      useCases: row.use_cases || [],
      skillLevel: row.skill_level,
      portabilityScore: row.portability_score,
      priceTier: row.price_tier,
      bestFor: row.best_for || [],
      notBestFor: row.not_best_for || [],
      tradeoffs: row.tradeoffs || [],
      ambiguityTriggers: row.ambiguity_triggers || [],
      confidenceScore: row.confidence_score,
      matchScore: 1.0,
      matchedFields: {},
    }));
  } catch (error) {
    console.error("[EnrichedSearch] Error fetching by variant IDs:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Check if enriched data is available
 */
export async function isEnrichedDataAvailable(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;

  try {
    const result = await client.query(
      "SELECT COUNT(*)::int AS count FROM public.kb_enriched_variants"
    );
    return (result.rows[0]?.count ?? 0) > 0;
  } catch (error) {
    console.error("[EnrichedSearch] Error checking data:", error);
    return false;
  } finally {
    client.release();
  }
}

