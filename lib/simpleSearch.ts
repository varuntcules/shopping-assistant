/**
 * Search using ONLY actual database columns:
 * 
 * kb_enriched_variants:
 * - variant_id, product_id
 * - use_cases (ARRAY): array of use case strings
 * - skill_level (text): 'beginner' | 'intermediate' | 'pro'
 * - price_tier (text): 'budget' | 'low' | 'mid' | 'high' | 'premium'
 * - portability_score (integer)
 * - best_for (ARRAY), not_best_for (ARRAY), tradeoffs (ARRAY)
 * - confidence_score (integer)
 * 
 * latest_product:
 * - id, title, handle, vendor, product_type, tags
 * - variants (jsonb): [{ price: string, title: string, ... }]
 * - images (jsonb): [{ src: string, ... }]
 */

import { Pool, PoolClient } from "pg";
import { generateEmbedding } from "./embeddings";

let pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
  if (!databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function getClient(): Promise<PoolClient | null> {
  const p = getPool();
  if (!p) return null;
  return p.connect();
}

/**
 * Match type for search results
 */
export type MatchType = 'exact' | 'semantic' | 'word_based' | 'fallback';

/**
 * Product result from search
 */
export interface ProductResult {
  productId: number;
  variantId: number;
  title: string;
  handle: string;
  price: number;
  imageUrl: string | null;
  matchScore: number;
  matchType: MatchType;  // How this product was matched
  matchedUseCases: string[];  // The use_cases that matched
  skillLevel?: string | null;
  priceTier?: string | null;
}

/**
 * Search result
 */
export interface SearchResult {
  products: ProductResult[];
  totalMatches: number;
  hasExactMatches: boolean;  // True if any product has similarity > 0.7
  bestMatchType: MatchType;  // Best match type among all results
}

/**
 * Format embedding for PostgreSQL vector type
 */
function formatVector(embedding: number[]): string {
  return "[" + embedding.join(",") + "]";
}

/**
 * Extract price from variants JSONB (first variant's price)
 */
function extractPrice(variants: unknown): number {
  if (!variants || !Array.isArray(variants) || variants.length === 0) return 0;
  const price = variants[0]?.price;
  return parseFloat(String(price)) || 0;
}

/**
 * Extract first image URL from images JSONB
 */
function extractImage(images: unknown): string | null {
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  return images[0]?.src || null;
}

/**
 * Normalize use case text for consistent matching
 * - Convert to lowercase
 * - Replace underscores and hyphens with spaces
 * - Trim whitespace
 */
function normalizeUseCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract significant words from a query (filter out common stop words)
 */
function extractSignificantWords(query: string): string[] {
  const stopWords = new Set(['for', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of', 'with', 'by']);
  const normalized = normalizeUseCase(query);
  return normalized
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Determine match type based on similarity score and matching strategy
 */
function determineMatchType(similarity: number, matchSource: string): MatchType {
  if (similarity > 0.7) {
    return 'exact';
  } else if (similarity >= 0.4) {
    return 'semantic';
  } else if (matchSource === 'word_based') {
    return 'word_based';
  } else {
    return 'fallback';
  }
}

/**
 * Search products using kb_enriched_variants
 * 
 * @param useCaseText - The use case text to search for (matches against use_cases array)
 * @param priceMin - Optional minimum price filter (filters variants->0->>'price')
 * @param priceMax - Optional maximum price filter (filters variants->0->>'price')
 * @param skillLevel - Optional skill level filter ('beginner' | 'intermediate' | 'pro')
 * @param limit - Max results to return
 */
export async function searchProducts(
  useCaseText: string,
  priceMin?: number | null,
  priceMax?: number | null,
  skillLevel?: string | null,
  limit: number = 6
): Promise<SearchResult> {
  // Validate useCaseText is not null or empty
  if (!useCaseText || useCaseText.trim() === "" || useCaseText === "null" || useCaseText === "Null") {
    console.warn("[SimpleSearch] Invalid useCaseText:", useCaseText);
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  }

  const client = await getClient();
  if (!client) {
    console.warn("[SimpleSearch] No database client");
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  }

  try {
    // Generate embedding for the use case query to do semantic matching
    const cleanUseCase = useCaseText.trim();
    console.log(`[SimpleSearch] Searching for: "${cleanUseCase}"`);
    const queryVector = await generateEmbedding(cleanUseCase);
    const vectorStr = formatVector(queryVector);

    // Extract significant words for word-based matching
    const significantWords = extractSignificantWords(cleanUseCase);
    const normalizedQuery = normalizeUseCase(cleanUseCase);

    // Search strategy:
    // 1. Use kb_embeddings for semantic search to find relevant use_cases (lower threshold: 0.25)
    // 2. Word-based matching: match individual words from query
    // 3. Fallback: direct text match with partial phrase matching
    // 4. Join with kb_enriched_variants to get structured data
    // 5. Filter by price and skill_level if provided
    // 6. Join with latest_product for product details
    
    // Build word matching conditions for SQL
    // Require at least one word to match, but prioritize matches with more words
    // Parameters start at $7 (after: vector=$1, skillLevel=$2, priceMin=$3, priceMax=$4, limit=$5, normalizedQuery=$6, wordCount=$7)
    const wordConditions = significantWords.length > 0
      ? significantWords.map((word, idx) => `LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) LIKE '%' || $${8 + idx}::text || '%'`).join(' OR ')
      : 'FALSE';
    
    // Count how many words from query appear in the embedding text
    // This will be used to prioritize better matches
    const wordCountExpression = significantWords.length > 0
      ? significantWords.map((word, idx) => 
          `CASE WHEN LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) LIKE '%' || $${8 + idx}::text || '%' THEN 1 ELSE 0 END`
        ).join(' + ')
      : '0';

    const sql = `
      WITH semantic_matches AS (
        -- Find relevant use cases via semantic search (lower threshold: 0.25)
        SELECT 
          ke.embedding_text as matched_use_case,
          1.0 - (ke.embedding <=> $1::vector) as similarity,
          'semantic' as match_source
        FROM kb_embeddings ke
        WHERE ke.embedding_type = 'use_cases'
          AND (1.0 - (ke.embedding <=> $1::vector)) >= 0.25  -- Lowered from 0.3 to 0.25
        ORDER BY ke.embedding <=> $1::vector
        LIMIT 20
      ),
      word_matches AS (
        -- Word-based matching: match embeddings containing significant words
        -- Prioritize matches that contain multiple words from the query
        -- Filter out overly generic matches (e.g., just "photography" without context)
        SELECT DISTINCT
          ke.embedding_text as matched_use_case,
          CASE
            -- Higher similarity if multiple words match (0.55 for 2+, 0.5 for 1)
            WHEN (${wordCountExpression}) >= 2 THEN 0.55
            ELSE 0.5
          END as similarity,
          'word_based' as match_source,
          (${wordCountExpression}) as matched_word_count,
          LENGTH(ke.embedding_text) as text_length  -- Include in SELECT for ORDER BY
        FROM kb_embeddings ke
        WHERE ke.embedding_type = 'use_cases'
          AND (${wordConditions})
          AND NOT EXISTS (SELECT 1 FROM semantic_matches WHERE similarity >= 0.35)
          -- Filter out overly generic single-word matches when query has multiple words
          AND (
            (${wordCountExpression}) >= 2  -- Multiple words match
            OR $7::int = 1  -- Or query only has one word (wordCount parameter)
            OR LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) NOT IN ('photography', 'studio', 'video', 'camera')  -- Not a generic term
          )
        ORDER BY 
          matched_word_count DESC,  -- Prioritize matches with more words
          text_length ASC  -- Then prioritize shorter, more specific matches
        LIMIT 15
      ),
      fallback_matches AS (
        -- Fallback: direct text match and partial phrase matching
        -- Enhanced to check if query words appear in sequence
        SELECT 
          ke.embedding_text as matched_use_case,
          0.6 as similarity,
          'fallback' as match_source
        FROM kb_embeddings ke
        WHERE ke.embedding_type = 'use_cases'
          AND (
            -- Direct text match
            LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) LIKE '%' || $6::text || '%'
            OR LOWER($6::text) LIKE '%' || LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) || '%'
            -- Partial phrase matching: check if normalized query words appear in sequence
            OR LOWER(REPLACE(REPLACE(ke.embedding_text, '_', ' '), '-', ' ')) LIKE '%' || REPLACE($6::text, ' ', '%') || '%'
          )
          AND NOT EXISTS (SELECT 1 FROM semantic_matches WHERE similarity >= 0.35)  -- Changed from 0.4 to 0.35
          AND NOT EXISTS (SELECT 1 FROM word_matches)
        LIMIT 10
      ),
      all_matches AS (
        SELECT matched_use_case, similarity, match_source FROM semantic_matches
        UNION ALL
        SELECT matched_use_case, similarity, match_source FROM word_matches
        UNION ALL
        SELECT matched_use_case, similarity, match_source FROM fallback_matches
      ),
      variant_matches AS (
        -- Match variants that have these use cases in their use_cases array
        -- Normalize embedding_text (spaces) to match use_cases format (underscores)
        -- Boost similarity for products with multiple matching use cases
        SELECT 
          kev.variant_id,
          kev.product_id,
          kev.use_cases,
          kev.skill_level,
          kev.price_tier,
          kev.confidence_score,
          MAX(am.similarity) as base_similarity,
          COUNT(DISTINCT am.matched_use_case) as match_count,
          -- Boost similarity if multiple use cases match (up to 0.1 bonus)
          LEAST(MAX(am.similarity) + (COUNT(DISTINCT am.matched_use_case) - 1) * 0.05, 1.0) as max_similarity,
          MAX(am.match_source) as match_source  -- Get the best match source
        FROM kb_enriched_variants kev
        CROSS JOIN all_matches am
        WHERE kev.use_cases @> ARRAY[REPLACE(am.matched_use_case, ' ', '_')]::text[]
        GROUP BY kev.variant_id, kev.product_id, kev.use_cases, kev.skill_level, kev.price_tier, kev.confidence_score
      ),
      ranked_variants AS (
        -- Rank variants by similarity and confidence, get best per product
        SELECT 
          vm.variant_id,
          vm.product_id,
          vm.use_cases,
          vm.skill_level,
          vm.price_tier,
          vm.max_similarity,
          vm.confidence_score,
          vm.match_source,
          ROW_NUMBER() OVER (PARTITION BY vm.product_id ORDER BY vm.max_similarity DESC, vm.confidence_score DESC) as rn
        FROM variant_matches vm
      )
      SELECT 
        rv.variant_id,
        rv.product_id,
        rv.use_cases,
        rv.skill_level,
        rv.price_tier,
        rv.max_similarity,
        rv.match_source,
        lp.title,
        lp.handle,
        lp.variants,
        lp.images
      FROM ranked_variants rv
      JOIN latest_product lp ON rv.product_id = lp.id
      WHERE 
        rv.rn = 1
        AND ($2::text IS NULL OR rv.skill_level = $2::text)
        AND ($3::numeric IS NULL OR (lp.variants->0->>'price')::numeric >= $3::numeric)
        AND ($4::numeric IS NULL OR (lp.variants->0->>'price')::numeric <= $4::numeric)
      ORDER BY rv.max_similarity DESC, rv.confidence_score DESC
      LIMIT $5::int
    `;

    // Build query parameters: vector, skillLevel, priceMin, priceMax, limit, normalizedQuery, wordCount, then significant words
    const queryParams: any[] = [
      vectorStr,
      skillLevel || null,
      priceMin || null,
      priceMax || null,
      limit,
      normalizedQuery,
      significantWords.length,  // Number of significant words for filtering
      ...significantWords,
    ];

    const result = await client.query(sql, queryParams);
    
    console.log(`[SimpleSearch] Query returned ${result.rows.length} rows`);
    if (result.rows.length > 0) {
      console.log(`[SimpleSearch] First result:`, {
        productId: result.rows[0].product_id,
        title: result.rows[0].title,
        price: extractPrice(result.rows[0].variants),
        similarity: result.rows[0].max_similarity,
        matchSource: result.rows[0].match_source,
      });
    }
    
    // Process results
    const products: ProductResult[] = result.rows.map((row) => {
      const similarity = parseFloat(row.max_similarity) || 0;
      const matchSource = row.match_source || 'fallback';
      const matchType = determineMatchType(similarity, matchSource);
      
      return {
        productId: Number(row.product_id),
        variantId: Number(row.variant_id),
        title: row.title || "",
        handle: row.handle || "",
        price: extractPrice(row.variants),
        imageUrl: extractImage(row.images),
        matchScore: similarity,
        matchType,
        matchedUseCases: Array.isArray(row.use_cases) ? row.use_cases : [],
        skillLevel: row.skill_level || null,
        priceTier: row.price_tier || null,
      };
    });

    // Sort by similarity and limit
    products.sort((a, b) => b.matchScore - a.matchScore);
    const limited = products.slice(0, limit);

    // Determine overall match quality
    const hasExactMatches = limited.some(p => p.matchType === 'exact');
    const bestMatchType = limited.length > 0 
      ? limited[0].matchType 
      : 'fallback';

    console.log(`[SimpleSearch] Found ${limited.length} products (exact matches: ${hasExactMatches}, best type: ${bestMatchType})`);
    return { 
      products: limited, 
      totalMatches: products.length,
      hasExactMatches,
      bestMatchType,
    };
  } catch (error) {
    console.error("[SimpleSearch] Error:", error);
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  } finally {
    client.release();
  }
}

/**
 * Search products by product type (tripod, light, camera, etc.)
 * Searches in product title, tags, and product_type fields
 */
export async function searchProductsByType(
  productType: string,
  priceMin?: number | null,
  priceMax?: number | null,
  limit: number = 6
): Promise<SearchResult> {
  if (!productType || productType.trim() === "") {
    console.warn("[SimpleSearch] Invalid productType:", productType);
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  }

  const client = await getClient();
  if (!client) {
    console.warn("[SimpleSearch] No database client");
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  }

  try {
    const normalizedType = productType.trim().toLowerCase();
    console.log(`[SimpleSearch] Searching for product type: "${normalizedType}"`);

    const sql = `
      SELECT DISTINCT
        kev.variant_id,
        kev.product_id,
        kev.use_cases,
        kev.skill_level,
        kev.price_tier,
        lp.title,
        lp.handle,
        lp.variants,
        lp.images,
        -- Calculate match score based on where the match was found
        CASE
          WHEN LOWER(lp.title) LIKE '%' || $1::text || '%' THEN 0.9
          WHEN LOWER(COALESCE(lp.product_type, '')) LIKE '%' || $1::text || '%' THEN 0.85
          WHEN LOWER(COALESCE(lp.tags, '')) LIKE '%' || $1::text || '%' THEN 0.8
          ELSE 0.7
        END as match_score,
        -- Include price in SELECT for ORDER BY
        (lp.variants->0->>'price')::numeric as price
      FROM latest_product lp
      JOIN kb_enriched_variants kev ON lp.id = kev.product_id
      WHERE 
        (
          LOWER(lp.title) LIKE '%' || $1::text || '%'
          OR LOWER(COALESCE(lp.product_type, '')) LIKE '%' || $1::text || '%'
          OR LOWER(COALESCE(lp.tags, '')) LIKE '%' || $1::text || '%'
        )
        AND ($2::numeric IS NULL OR (lp.variants->0->>'price')::numeric >= $2::numeric)
        AND ($3::numeric IS NULL OR (lp.variants->0->>'price')::numeric <= $3::numeric)
      ORDER BY match_score DESC, price ASC
      LIMIT $4::int
    `;

    const result = await client.query(sql, [
      normalizedType,
      priceMin || null,
      priceMax || null,
      limit,
    ]);

    console.log(`[SimpleSearch] Query returned ${result.rows.length} rows`);
    
    const products: ProductResult[] = result.rows.map((row) => ({
      productId: Number(row.product_id),
      variantId: Number(row.variant_id),
      title: row.title || "",
      handle: row.handle || "",
      price: extractPrice(row.variants),
      imageUrl: extractImage(row.images),
      matchScore: parseFloat(row.match_score) || 0,
      matchType: 'exact' as MatchType, // Product type matches are considered exact
      matchedUseCases: Array.isArray(row.use_cases) ? row.use_cases : [],
      skillLevel: row.skill_level || null,
      priceTier: row.price_tier || null,
    }));

    console.log(`[SimpleSearch] Found ${products.length} products by type`);
    return {
      products,
      totalMatches: products.length,
      hasExactMatches: products.length > 0,
      bestMatchType: 'exact',
    };
  } catch (error) {
    console.error("[SimpleSearch] Error searching by type:", error);
    return { products: [], totalMatches: 0, hasExactMatches: false, bestMatchType: 'fallback' };
  } finally {
    client.release();
  }
}

/**
 * Check if kb_enriched_variants has data
 */
export async function isSearchAvailable(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    const result = await client.query("SELECT COUNT(*)::int as count FROM kb_enriched_variants");
    return (result.rows[0]?.count ?? 0) > 0;
  } catch {
    return false;
  } finally {
    client.release();
  }
}
