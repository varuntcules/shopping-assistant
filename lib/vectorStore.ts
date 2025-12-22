import { EnrichedProduct } from "./productEnricher";
import { EMBEDDING_DIMENSION } from "./embeddings";
import { Pool, PoolClient } from "pg";

// Singleton connection pool
let pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.warn(
      "[VectorStore] DATABASE_URL (or SUPABASE_DB_URL) is not set. Knowledge base will appear uninitialized."
    );
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      // Allow SSL-required environments like Supabase without rejecting self-signed certs
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

const TABLE_NAME = "products";

/**
 * Product record stored in Postgres
 */
export interface ProductRecord {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  imageAlt: string; // Empty string if null (LanceDB requires non-null)
  allTags: string; // Stored as comma-separated string
  priceTier: string;
  embeddingText: string; // The text used to create embedding
  vector: number[]; // The embedding vector
}

/**
 * Convert enriched products to records for storage
 */
export function toProductRecords(
  products: EnrichedProduct[],
  embeddings: number[][],
  embeddingTexts: string[]
): ProductRecord[] {
  return products.map((p, i) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    vendor: p.vendor || "",
    productType: p.productType || "",
    description: (p.description || "").slice(0, 500), // Truncate for storage
    price: p.price || 0,
    currency: p.currency || "INR",
    imageUrl: p.imageUrl || "",
    imageAlt: p.imageAlt || "", // Store as empty string instead of null
    allTags: p.allTags.join(", "),
    priceTier: p.priceTier || "mid-range",
    embeddingText: embeddingTexts[i],
    vector: embeddings[i],
  }));
}

/**
 * Upsert products into the vector store (Postgres + pgvector)
 */
export async function upsertProducts(records: ProductRecord[]): Promise<void> {
  if (records.length === 0) {
    console.log("[VectorStore] No records to upsert");
    return;
  }

  const client = await getClient();
  if (!client) {
    console.warn("[VectorStore] No database client available. Skipping upsert.");
    return;
  }

  try {
    await client.query("BEGIN");

    // Ensure table and extension exist
    await client.query('CREATE EXTENSION IF NOT EXISTS "vector";');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        handle TEXT NOT NULL,
        vendor TEXT NOT NULL,
        product_type TEXT NOT NULL,
        description TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        currency TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_alt TEXT NOT NULL,
        all_tags TEXT NOT NULL,
        price_tier TEXT NOT NULL,
        embedding_text TEXT NOT NULL,
        vector vector(${EMBEDDING_DIMENSION}) NOT NULL
      )
    `);

    // Full refresh for simplicity: clear table then bulk insert
    await client.query(`TRUNCATE TABLE ${TABLE_NAME};`);

    const insertValues: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const record of records) {
      const placeholders = [
        `$${paramIndex++}`, // id
        `$${paramIndex++}`, // title
        `$${paramIndex++}`, // handle
        `$${paramIndex++}`, // vendor
        `$${paramIndex++}`, // product_type
        `$${paramIndex++}`, // description
        `$${paramIndex++}`, // price
        `$${paramIndex++}`, // currency
        `$${paramIndex++}`, // image_url
        `$${paramIndex++}`, // image_alt
        `$${paramIndex++}`, // all_tags
        `$${paramIndex++}`, // price_tier
        `$${paramIndex++}`, // embedding_text
        `$${paramIndex++}::vector`, // vector
      ];

      insertValues.push(`(${placeholders.join(", ")})`);

      params.push(
        record.id,
        record.title,
        record.handle,
        record.vendor,
        record.productType,
        record.description,
        record.price,
        record.currency,
        record.imageUrl,
        record.imageAlt,
        record.allTags,
        record.priceTier,
        record.embeddingText,
        // pgvector expects a string like "[0.1, 0.2, ...]"
        JSON.stringify(record.vector)
      );
    }

    const insertQuery = `
      INSERT INTO ${TABLE_NAME} (
        id,
        title,
        handle,
        vendor,
        product_type,
        description,
        price,
        currency,
        image_url,
        image_alt,
        all_tags,
        price_tier,
        embedding_text,
        vector
      )
      VALUES ${insertValues.join(", ")}
    `;

    await client.query(insertQuery, params);

    console.log(`[VectorStore] Upserted ${records.length} products into Postgres`);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[VectorStore] Error upserting products:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Search products by vector similarity
 */
export async function searchByVector(
  queryVector: number[],
  options: {
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    priceTier?: string;
  } = {}
): Promise<ProductRecord[]> {
  const { limit = 12, minPrice, maxPrice, priceTier } = options;

  const client = await getClient();
  if (!client) {
    console.warn("[VectorStore] No database client available. Returning empty results.");
    return [];
  }

  try {
    // Build WHERE clause
    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Query vector parameter – pgvector expects a string literal like "[0.1, 0.2, ...]"
    const queryVectorLiteral = JSON.stringify(queryVector);
    params.push(queryVectorLiteral);
    const vectorParamIndex = paramIndex++;

    if (minPrice !== undefined) {
      whereClauses.push(`price >= $${paramIndex}`);
      params.push(minPrice);
      paramIndex++;
    }

    if (maxPrice !== undefined) {
      whereClauses.push(`price <= $${paramIndex}`);
      params.push(maxPrice);
      paramIndex++;
    }

    if (priceTier) {
      whereClauses.push(`price_tier = $${paramIndex}`);
      params.push(priceTier);
      paramIndex++;
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Use pgvector cosine distance (<->) for similarity
    const sql = `
      SELECT
        id,
        title,
        handle,
        vendor,
        product_type,
        description,
        price,
        currency,
        image_url,
        image_alt,
        all_tags,
        price_tier,
        embedding_text,
        vector
      FROM ${TABLE_NAME}
      ${whereSql}
      ORDER BY vector <-> $${vectorParamIndex}::vector
      LIMIT $${paramIndex}
    `;
    params.push(limit * 2); // fetch extra for re-ranking in knowledgeBase

    const result = await client.query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      handle: row.handle,
      vendor: row.vendor,
      productType: row.product_type,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      imageUrl: row.image_url,
      imageAlt: row.image_alt,
      allTags: row.all_tags,
      priceTier: row.price_tier,
      embeddingText: row.embedding_text,
      vector: row.vector as number[],
    }));
  } catch (error) {
    console.error("[VectorStore] Error searching by vector:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Get all products from the store (for debugging/testing)
 */
export async function getAllProducts(): Promise<ProductRecord[]> {
  const client = await getClient();
  if (!client) {
    console.warn("[VectorStore] No database client available. Returning empty list.");
    return [];
  }

  try {
    const result = await client.query(
      `
      SELECT
        id,
        title,
        handle,
        vendor,
        product_type,
        description,
        price,
        currency,
        image_url,
        image_alt,
        all_tags,
        price_tier,
        embedding_text,
        vector
      FROM ${TABLE_NAME}
    `
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      handle: row.handle,
      vendor: row.vendor,
      productType: row.product_type,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      imageUrl: row.image_url,
      imageAlt: row.image_alt,
      allTags: row.all_tags,
      priceTier: row.price_tier,
      embeddingText: row.embedding_text,
      vector: row.vector as number[],
    }));
  } catch (error) {
    console.error("[VectorStore] Error getting all products:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Get product count
 */
export async function getProductCount(): Promise<number> {
  const client = await getClient();
  if (!client) {
    console.warn("[VectorStore] No database client available. Returning count = 0.");
    return 0;
  }

  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${TABLE_NAME}`
    );
    return result.rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[VectorStore] Error getting product count:", error);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Check if the store has been initialized
 */
export async function isInitialized(): Promise<boolean> {
  const count = await getProductCount();
  return count > 0;
}

