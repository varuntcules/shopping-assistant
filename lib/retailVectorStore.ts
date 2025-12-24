/**
 * Retail Vector Store
 * 
 * Fetches products from Supabase tables: products_dummy, camera_specs, lens_specs
 */

import { EMBEDDING_DIMENSION } from "./embeddings";
import { Pool, PoolClient } from "pg";

// Singleton connection pool
let pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.warn("[RetailVectorStore] DATABASE_URL not set.");
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

// Table names from Supabase
const PRODUCTS_TABLE = "products_dummy";
const CAMERA_SPECS_TABLE = "camera_specs";
const LENS_SPECS_TABLE = "lens_specs";

/**
 * Retail product from Supabase
 */
export interface RetailProduct {
  id: string;
  name: string;
  category: string; // Product type from DB (e.g., "Mirrorless Camera", "Lens", etc.)
  description: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

/**
 * Search options
 */
export interface RetailSearchOptions {
  category: "camera" | "lens" | "microphone" | "tripod" | "stabilization" | "other";
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Search products using vector similarity
 */
export async function searchRetailProducts(
  queryVector: number[],
  options: RetailSearchOptions
): Promise<RetailProduct[]> {
  const { category, limit = 10, minPrice, maxPrice } = options;

  const client = await getClient();
  if (!client) {
    console.warn("[RetailVectorStore] No database client available.");
    return [];
  }

  try {
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Query vector
    const queryVectorLiteral = JSON.stringify(queryVector);
    params.push(queryVectorLiteral);
    const vectorParamIndex = paramIndex++;

    // Category filter - use ILIKE for flexible matching
    // Map our categories to product_type patterns
    const categoryPatterns: Record<string, string> = {
      camera: "%Camera%",
      lens: "%Lens%",
      microphone: "%Microphone%",
      tripod: "%Tripod%",
      stabilization: "%Stabiliz%",
      lighting: "%Light%",
      other: "%",
    };
    
    const pattern = categoryPatterns[category] || "%";
    if (pattern !== "%") {
      whereClauses.push(`p.product_type ILIKE $${paramIndex}`);
      params.push(pattern);
      paramIndex++;
    }

    // Price filters
    if (minPrice !== undefined) {
      whereClauses.push(`p.price >= $${paramIndex}`);
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice !== undefined) {
      whereClauses.push(`p.price <= $${paramIndex}`);
      params.push(maxPrice);
      paramIndex++;
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Build JOIN for specs
    let joinClause = "";
    // Note: products_dummy table uses 'title' not 'name', and 'product_type' not 'category'
    let selectFields = `
      p.id,
      p.title as name,
      p.product_type as category,
      COALESCE(p.description, '') as description,
      p.price,
      COALESCE(p.currency, 'INR') as currency,
      p.image_url as image_url
    `;

    if (category === "camera") {
      joinClause = `LEFT JOIN ${CAMERA_SPECS_TABLE} cs ON p.id = cs.product_id`;
    } else if (category === "lens") {
      joinClause = `LEFT JOIN ${LENS_SPECS_TABLE} ls ON p.id = ls.product_id`;
    }

    // Try vector search, fallback to text search
    let result;
    const sql = `
      SELECT ${selectFields}
      FROM ${PRODUCTS_TABLE} p
      ${joinClause}
      ${whereSql}
      ORDER BY p.vector <-> $${vectorParamIndex}::vector
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    try {
      result = await client.query(sql, params);
    } catch (vectorError: unknown) {
      // Fallback to text search
      console.warn("[RetailVectorStore] Vector search failed, using text search:", vectorError);
      const textParams = params.slice(0, -1); // Remove limit
      const textSql = `
        SELECT ${selectFields}
        FROM ${PRODUCTS_TABLE} p
        ${joinClause}
        ${whereSql}
        ORDER BY p.title, p.price
        LIMIT $${textParams.length + 1}
      `;
      textParams.push(limit);
      result = await client.query(textSql, textParams);
    }

    return result.rows.map((row) => ({
      id: String(row.id),
      name: row.name || row.title,
      category: row.category || row.product_type || "other",
      description: row.description || "",
      price: Number(row.price),
      currency: row.currency || "INR",
      imageUrl: row.image_url,
    }));
  } catch (error) {
    console.error("[RetailVectorStore] Error searching products:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Check if store is initialized
 */
export async function isRetailStoreInitialized(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;

  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${PRODUCTS_TABLE}`
    );
    return (result.rows[0]?.count ?? 0) > 0;
  } catch (error) {
    return false;
  } finally {
    client.release();
  }
}
