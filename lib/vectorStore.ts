import * as lancedb from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import path from "path";
import { EnrichedProduct } from "./productEnricher";
import { EMBEDDING_DIMENSION } from "./embeddings";

// Database path
const DB_PATH = path.join(process.cwd(), "data", "products.lance");
const TABLE_NAME = "products";

// Singleton connection
let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;

/**
 * Product record stored in LanceDB
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
 * Initialize database connection
 */
async function getDb(): Promise<lancedb.Connection> {
  if (!db) {
    // Ensure data directory exists
    const fs = await import("fs/promises");
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    
    db = await lancedb.connect(DB_PATH);
    console.log("[VectorStore] Connected to LanceDB at:", DB_PATH);
  }
  return db;
}

/**
 * Get or create the products table
 */
async function getTable(): Promise<lancedb.Table> {
  if (table) {
    return table;
  }
  
  const database = await getDb();
  const tableNames = await database.tableNames();
  
  if (tableNames.includes(TABLE_NAME)) {
    table = await database.openTable(TABLE_NAME);
    console.log("[VectorStore] Opened existing table:", TABLE_NAME);
  } else {
    // Create empty table with schema
    // LanceDB requires at least one record to infer schema
    // We'll create it on first upsert
    table = null;
    console.log("[VectorStore] Table does not exist yet, will create on first upsert");
  }
  
  return table!;
}

/**
 * Create Arrow schema for the products table
 */
function createSchema(): arrow.Schema {
  return new arrow.Schema([
    new arrow.Field("id", new arrow.Utf8()),
    new arrow.Field("title", new arrow.Utf8()),
    new arrow.Field("handle", new arrow.Utf8()),
    new arrow.Field("vendor", new arrow.Utf8()),
    new arrow.Field("productType", new arrow.Utf8()),
    new arrow.Field("description", new arrow.Utf8()),
    new arrow.Field("price", new arrow.Float64()),
    new arrow.Field("currency", new arrow.Utf8()),
    new arrow.Field("imageUrl", new arrow.Utf8()),
    new arrow.Field("imageAlt", new arrow.Utf8()),
    new arrow.Field("allTags", new arrow.Utf8()),
    new arrow.Field("priceTier", new arrow.Utf8()),
    new arrow.Field("embeddingText", new arrow.Utf8()),
    new arrow.Field("vector", new arrow.FixedSizeList(EMBEDDING_DIMENSION, new arrow.Field("item", new arrow.Float32()))),
  ]);
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
    imageAlt: p.imageAlt || "", // Convert null to empty string for LanceDB
    allTags: p.allTags.join(", "),
    priceTier: p.priceTier || "mid-range",
    embeddingText: embeddingTexts[i],
    vector: embeddings[i],
  }));
}

/**
 * Upsert products into the vector store
 */
export async function upsertProducts(records: ProductRecord[]): Promise<void> {
  if (records.length === 0) {
    console.log("[VectorStore] No records to upsert");
    return;
  }
  
  const database = await getDb();
  const tableNames = await database.tableNames();
  
  if (tableNames.includes(TABLE_NAME)) {
    // Drop and recreate for simplicity (full sync)
    await database.dropTable(TABLE_NAME);
    console.log("[VectorStore] Dropped existing table for full sync");
  }
  
  // Create new table with data
  // Cast to satisfy LanceDB's type requirements
  table = await database.createTable(TABLE_NAME, records as unknown as Record<string, unknown>[]);
  
  console.log(`[VectorStore] Upserted ${records.length} products`);
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
  
  const database = await getDb();
  const tableNames = await database.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    console.log("[VectorStore] No products table found");
    return [];
  }
  
  const tbl = await database.openTable(TABLE_NAME);
  
  // Build the query
  let query = tbl.vectorSearch(queryVector).limit(limit * 2); // Fetch extra for filtering
  
  // Apply filters if specified
  let whereClause = "";
  if (minPrice !== undefined) {
    whereClause += `price >= ${minPrice}`;
  }
  if (maxPrice !== undefined) {
    if (whereClause) whereClause += " AND ";
    whereClause += `price <= ${maxPrice}`;
  }
  if (priceTier) {
    if (whereClause) whereClause += " AND ";
    whereClause += `priceTier = '${priceTier}'`;
  }
  
  if (whereClause) {
    query = query.where(whereClause);
  }
  
  const results = await query.toArray();
  
  // Return only the requested limit
  return results.slice(0, limit) as unknown as ProductRecord[];
}

/**
 * Get all products from the store (for debugging/testing)
 */
export async function getAllProducts(): Promise<ProductRecord[]> {
  const database = await getDb();
  const tableNames = await database.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }
  
  const tbl = await database.openTable(TABLE_NAME);
  const results = await tbl.query().toArray();
  
  return results as unknown as ProductRecord[];
}

/**
 * Get product count
 */
export async function getProductCount(): Promise<number> {
  const database = await getDb();
  const tableNames = await database.tableNames();
  
  if (!tableNames.includes(TABLE_NAME)) {
    return 0;
  }
  
  const tbl = await database.openTable(TABLE_NAME);
  return await tbl.countRows();
}

/**
 * Check if the store has been initialized
 */
export async function isInitialized(): Promise<boolean> {
  const count = await getProductCount();
  return count > 0;
}

