/**
 * Semantic Search Module
 *
 * Port of semantic_search.py to TypeScript
 * Provides priority-weighted semantic search over kb_embeddings and kb_enriched_variants
 */

import { Pool, PoolClient } from "pg";
import { generateEmbedding } from "./embeddings";

// ============================================================================
// PRIORITY WEIGHTS
// ============================================================================

const PRIORITY_WEIGHTS: Record<string, number> = {
  use_cases: 1.0, // Highest priority
  best_for: 0.7, // Medium priority
  not_best_for: 0.3, // Low priority
  tradeoffs: 0.3, // Low priority
  ambiguity_triggers: 0.3, // Low priority
};

// Field mapping: user field name -> database embedding_type
const FIELD_MAPPING: Record<string, string> = {
  use_case: "use_cases",
  best_for: "best_for",
  not_best_for: "not_best_for",
  tradeoff: "tradeoffs",
  ambiguity_triggers: "ambiguity_triggers",
};

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

let pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.warn("[SemanticSearch] DATABASE_URL not set.");
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

// ============================================================================
// TYPES
// ============================================================================

export interface SemanticSearchQuery {
  use_case?: string;
  best_for?: string;
  not_best_for?: string;
  tradeoff?: string;
  ambiguity_triggers?: string;
}

export interface MatchDetails {
  embedding_text: string;
  similarity_score: number;
}

export interface EnrichedVariant {
  variant_id: string;
  product_id: string;
  use_cases: string[];
  skill_level: string | null;
  portability_score: number | null;
  price_tier: string | null;
  best_for: string[];
  not_best_for: string[];
  tradeoffs: string[];
  ambiguity_triggers: string[];
  confidence_score: number | null;
  // Product details from latest_product
  product_title: string;
  product_handle: string | null;
  vendor: string | null;
  product_type: string | null;
  body_html: string | null;
  images: unknown | null;
  variants: unknown | null;
}

export interface SemanticSearchResult extends EnrichedVariant {
  final_score: number;
  match_count: number;
  total_fields_searched: number;
  matches: Record<string, MatchDetails>;
}

export interface SemanticSearchOptions {
  limit?: number;
  min_score?: number;
  skill_level?: string;
  price_tier?: string;
  budget_min?: number;
  budget_max?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Preprocess query text to match how embeddings were created.
 * Replace underscores with spaces to match embedding format.
 */
function preprocessQuery(text: string): string {
  if (!text || !text.trim()) return "";
  // Replace underscores with spaces (to match embedding format)
  let processed = text.replace(/_/g, " ");
  // Normalize whitespace
  processed = processed.replace(/\s+/g, " ");
  return processed.trim();
}

/**
 * Format embedding array to PostgreSQL vector format
 */
function formatEmbeddingForDb(embedding: number[]): string {
  if (!embedding || embedding.length === 0) return "";
  return "[" + embedding.map((x) => x.toString()).join(",") + "]";
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Perform structured semantic search with field-specific matching.
 *
 * Priority weights:
 * - use_case: 1.0 (highest)
 * - best_for: 0.7 (medium)
 * - not_best_for, tradeoff, ambiguity_triggers: 0.3 (lowest)
 */
export async function semanticSearchStructured(
  queryFields: SemanticSearchQuery,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  const { limit = 10, min_score = 0.5, skill_level, price_tier, budget_min, budget_max } = options;

  // Generate embeddings for all provided query fields
  const queryEmbeddings: Record<
    string,
    {
      embedding: number[];
      embeddingStr: string;
      weight: number;
      queryText: string;
    }
  > = {};

  for (const [fieldName, queryText] of Object.entries(queryFields)) {
    if (queryText && queryText.trim()) {
      const processedText = preprocessQuery(queryText.trim());
      if (!processedText) continue;

      try {
        const embedding = await generateEmbedding(processedText);
        if (embedding && embedding.length > 0) {
          const dbFieldName = FIELD_MAPPING[fieldName] || fieldName;
          queryEmbeddings[dbFieldName] = {
            embedding,
            embeddingStr: formatEmbeddingForDb(embedding),
            weight: PRIORITY_WEIGHTS[dbFieldName] || 0.5,
            queryText: processedText,
          };
        }
      } catch (error) {
        console.error(
          `[SemanticSearch] Error generating embedding for ${fieldName}:`,
          error
        );
      }
    }
  }

  if (Object.keys(queryEmbeddings).length === 0) {
    console.warn("[SemanticSearch] No valid query embeddings generated");
    return [];
  }

  const client = await getClient();
  if (!client) {
    console.warn("[SemanticSearch] No database client available");
    return [];
  }

  try {
    // Store matches per variant per field type
    const variantMatches: Record<
      string,
      Record<
        string,
        {
          embedding_text: string;
          similarity_score: number;
          weighted_score: number;
          weight: number;
        }
      >
    > = {};

    // Search each field type separately and collect matches
    for (const [fieldType, queryInfo] of Object.entries(queryEmbeddings)) {
      const { embeddingStr, weight } = queryInfo;

      const result = await client.query(
        `
        SELECT 
          ke.variant_id::text as variant_id,
          ke.product_id::text as product_id,
          ke.embedding_type,
          ke.embedding_text,
          1.0 * (1 - (ke.embedding <=> $1::vector)) as similarity_score
        FROM public.kb_embeddings ke
        WHERE ke.embedding_type = $2
        AND (1 - (ke.embedding <=> $1::vector)) >= $3
        ORDER BY ke.embedding <=> $1::vector
        LIMIT $4
        `,
        [embeddingStr, fieldType, min_score, limit * 3]
      );

      // Store best match per variant for this field type
      for (const row of result.rows) {
        const variantId = row.variant_id;
        const similarity = parseFloat(row.similarity_score);
        const weightedScore = similarity * weight;

        if (!variantMatches[variantId]) {
          variantMatches[variantId] = {};
        }

        // Store the best match for this field type (highest weighted score)
        if (
          !variantMatches[variantId][fieldType] ||
          weightedScore > variantMatches[variantId][fieldType].weighted_score
        ) {
          variantMatches[variantId][fieldType] = {
            embedding_text: row.embedding_text,
            similarity_score: similarity,
            weighted_score: weightedScore,
            weight,
          };
        }
      }
    }

    if (Object.keys(variantMatches).length === 0) {
      console.log("[SemanticSearch] No matching variants found");
      return [];
    }

    // Get variant IDs that have at least one match
    const variantIds = Object.keys(variantMatches);

    // Build WHERE clause for filters
    const whereClauses: string[] = [`kev.variant_id = ANY($1::bigint[])`];
    const params: unknown[] = [variantIds.map((id) => BigInt(id))];
    let paramIndex = 2;

    if (skill_level) {
      whereClauses.push(`kev.skill_level = $${paramIndex}`);
      params.push(skill_level);
      paramIndex++;
    }

    if (price_tier) {
      whereClauses.push(`kev.price_tier = $${paramIndex}`);
      params.push(price_tier);
      paramIndex++;
    }

    // Get full variant details including product info
    const variantQuery = `
      SELECT 
        kev.variant_id::text as variant_id,
        kev.product_id::text as product_id,
        kev.use_cases,
        kev.skill_level,
        kev.portability_score,
        kev.price_tier,
        kev.best_for,
        kev.not_best_for,
        kev.tradeoffs,
        kev.ambiguity_triggers,
        COALESCE(kev.confidence_score, 50) as confidence_score,
        lp.title as product_title,
        lp.handle as product_handle,
        lp.vendor,
        lp.product_type,
        lp.body_html,
        lp.images,
        lp.variants
      FROM public.kb_enriched_variants kev
      LEFT JOIN public.latest_product lp ON kev.product_id = lp.id
      WHERE ${whereClauses.join(" AND ")}
    `;

    const variantResult = await client.query(variantQuery, params);

    const variantDetails: Record<string, EnrichedVariant> = {};
    for (const row of variantResult.rows) {
      variantDetails[row.variant_id] = {
        variant_id: row.variant_id,
        product_id: row.product_id,
        use_cases: row.use_cases || [],
        skill_level: row.skill_level,
        portability_score: row.portability_score,
        price_tier: row.price_tier,
        best_for: row.best_for || [],
        not_best_for: row.not_best_for || [],
        tradeoffs: row.tradeoffs || [],
        ambiguity_triggers: row.ambiguity_triggers || [],
        confidence_score: row.confidence_score,
        product_title: row.product_title || "Unknown Product",
        product_handle: row.product_handle,
        vendor: row.vendor,
        product_type: row.product_type,
        body_html: row.body_html,
        images: row.images,
        variants: row.variants,
      };
    }

    // Calculate final scores for each variant
    const results: SemanticSearchResult[] = [];

    for (const [variantId, fieldMatches] of Object.entries(variantMatches)) {
      if (!variantDetails[variantId]) {
        continue;
      }

      // Calculate aggregate score
      let totalWeightedScore = 0;
      let totalWeight = 0;
      let matchCount = 0;

      // Collect match information
      const matchDetails: Record<string, MatchDetails> = {};

      for (const [fieldType, matchInfo] of Object.entries(fieldMatches)) {
        totalWeightedScore += matchInfo.weighted_score;
        totalWeight += matchInfo.weight;
        matchCount++;
        matchDetails[fieldType] = {
          embedding_text: matchInfo.embedding_text,
          similarity_score: matchInfo.similarity_score,
        };
      }

      // Average weighted score (normalized by total weights)
      let finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

      // Boost score based on number of matches (variants matching multiple criteria are better)
      const matchBonus =
        0.1 * Math.min(matchCount / Object.keys(queryEmbeddings).length, 1.0);
      finalScore = Math.min(finalScore + matchBonus, 1.0);

      // Add confidence score influence (10% weight)
      const confidence = variantDetails[variantId].confidence_score || 50;
      const confidenceFactor = (confidence / 100.0) * 0.1;
      finalScore = Math.min(finalScore + confidenceFactor, 1.0);

      // Apply budget filter if provided
      if (budget_min !== undefined || budget_max !== undefined) {
        // Get price from variants JSON
        const variants = variantDetails[variantId].variants;
        if (variants && Array.isArray(variants) && variants.length > 0) {
          const price = parseFloat(variants[0]?.price || "0");
          if (budget_min !== undefined && price < budget_min) continue;
          if (budget_max !== undefined && price > budget_max) continue;
        }
      }

      results.push({
        ...variantDetails[variantId],
        final_score: finalScore,
        match_count: matchCount,
        total_fields_searched: Object.keys(queryEmbeddings).length,
        matches: matchDetails,
      });
    }

    // Sort by final score (highest first)
    results.sort((a, b) => b.final_score - a.final_score);

    // Return top results
    return results.slice(0, limit);
  } catch (error) {
    console.error("[SemanticSearch] Error during search:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Simple semantic search using just use_case query
 * This is the most common search pattern
 */
export async function searchByUseCase(
  useCase: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult[]> {
  return semanticSearchStructured({ use_case: useCase }, options);
}

/**
 * Check if semantic search tables are available
 */
export async function isSemanticSearchAvailable(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;

  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM public.kb_embeddings LIMIT 1`
    );
    return (result.rows[0]?.count ?? 0) > 0;
  } catch (error) {
    console.error("[SemanticSearch] Error checking availability:", error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Get common ambiguity triggers from a set of results
 * Used to determine if clarifying questions are needed
 */
export function extractCommonAmbiguityTriggers(
  results: SemanticSearchResult[],
  threshold: number = 0.5
): string[] {
  if (results.length === 0) return [];

  // Count occurrences of each trigger
  const triggerCounts: Record<string, number> = {};
  for (const result of results) {
    for (const trigger of result.ambiguity_triggers) {
      triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
    }
  }

  // Return triggers that appear in more than threshold % of results
  const minCount = Math.ceil(results.length * threshold);
  return Object.entries(triggerCounts)
    .filter(([, count]) => count >= minCount)
    .map(([trigger]) => trigger);
}

/**
 * Map price tier to budget range
 */
export function priceTierToBudgetRange(tier: string): { min?: number; max?: number } {
  const ranges: Record<string, { min?: number; max?: number }> = {
    budget: { max: 5000 },
    low: { min: 5000, max: 10000 },
    mid: { min: 10000, max: 20000 },
    high: { min: 20000, max: 50000 },
    premium: { min: 50000 },
  };
  return ranges[tier.toLowerCase()] || {};
}

/**
 * Map budget to price tier
 */
export function budgetToPriceTier(budget: { min?: number; max?: number }): string | null {
  if (budget.max && budget.max <= 5000) return "budget";
  if (budget.max && budget.max <= 10000) return "low";
  if (budget.max && budget.max <= 20000) return "mid";
  if (budget.max && budget.max <= 50000) return "high";
  if (budget.min && budget.min >= 50000) return "premium";
  if (budget.min && budget.min >= 20000) return "high";
  if (budget.min && budget.min >= 10000) return "mid";
  return null;
}




