/**
 * Check Products Access Script
 * 
 * Verifies that the app can access products from the products_dummy table in Supabase.
 * This is a read-only check - no syncs or embeddings are performed.
 * 
 * Usage:
 *   npx tsx scripts/check-products-access.ts
 */

import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PRODUCTS_TABLE = "products_dummy";

async function checkProductsAccess() {
  console.log("=".repeat(60));
  console.log("Products Access Check");
  console.log("Started at:", new Date().toISOString());
  console.log("=".repeat(60));

  // Get database connection
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.error("\n❌ ERROR: DATABASE_URL or SUPABASE_DB_URL not set!");
    console.error("   Please set one of these environment variables in .env.local");
    process.exit(1);
  }

  console.log("\n✓ Database URL configured");

  // Create connection pool
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DB_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    console.log("✓ Database connection established\n");

    // Check 1: Count total products
    console.log("Checking product count...");
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${PRODUCTS_TABLE}`
    );
    const productCount = countResult.rows[0]?.count ?? 0;
    console.log(`  Total products: ${productCount}`);

    if (productCount === 150) {
      console.log("  ✓ Expected count (150) matches!\n");
    } else {
      console.log(`  ⚠️  Expected 150 products, found ${productCount}\n`);
    }

    // Check 2: Verify table structure
    console.log("Checking table structure...");
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = '${PRODUCTS_TABLE}'
      ORDER BY ordinal_position
    `);
    console.log(`  Columns found: ${columnsResult.rows.length}`);
    const hasVector = columnsResult.rows.some((row) => row.column_name === "vector");
    const hasTitle = columnsResult.rows.some((row) => row.column_name === "title");
    const hasPrice = columnsResult.rows.some((row) => row.column_name === "price");
    
    console.log(`  ✓ Has 'vector' column: ${hasVector}`);
    console.log(`  ✓ Has 'title' column: ${hasTitle}`);
    console.log(`  ✓ Has 'price' column: ${hasPrice}\n`);

    // Check 3: Fetch sample products
    console.log("Fetching sample products...");
    const sampleResult = await client.query(`
      SELECT 
        id,
        title,
        product_type,
        price,
        currency,
        CASE WHEN vector IS NULL THEN false ELSE true END as has_vector
      FROM ${PRODUCTS_TABLE}
      ORDER BY title
      LIMIT 5
    `);
    
    console.log(`  Sample products (first 5):`);
    sampleResult.rows.forEach((row, index) => {
      console.log(`    ${index + 1}. ${row.title} (${row.product_type}) - ${row.currency} ${row.price}`);
      console.log(`       ID: ${row.id}, Has vector: ${row.has_vector}`);
    });

    // Check 4: Count products with vectors
    console.log("\nChecking vector embeddings...");
    const vectorCountResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${PRODUCTS_TABLE} WHERE vector IS NOT NULL`
    );
    const vectorCount = vectorCountResult.rows[0]?.count ?? 0;
    console.log(`  Products with vectors: ${vectorCount} / ${productCount}`);
    
    if (vectorCount === productCount) {
      console.log("  ✓ All products have vector embeddings\n");
    } else {
      console.log(`  ⚠️  ${productCount - vectorCount} products missing vector embeddings\n`);
    }

    // Check 5: Product type distribution
    console.log("Checking product type distribution...");
    const typeResult = await client.query(`
      SELECT 
        product_type,
        COUNT(*)::int AS count
      FROM ${PRODUCTS_TABLE}
      GROUP BY product_type
      ORDER BY count DESC
    `);
    console.log("  Product types:");
    typeResult.rows.forEach((row) => {
      console.log(`    - ${row.product_type}: ${row.count}`);
    });

    // Check 6: Price range
    console.log("\nChecking price range...");
    const priceResult = await client.query(`
      SELECT 
        MIN(price)::numeric AS min_price,
        MAX(price)::numeric AS max_price,
        AVG(price)::numeric AS avg_price,
        COUNT(DISTINCT currency)::int AS currency_count
      FROM ${PRODUCTS_TABLE}
    `);
    const priceInfo = priceResult.rows[0];
    console.log(`  Min price: ${priceInfo.min_price}`);
    console.log(`  Max price: ${priceInfo.max_price}`);
    console.log(`  Avg price: ${Math.round(priceInfo.avg_price)}`);
    console.log(`  Currencies: ${priceInfo.currency_count}`);

    client.release();

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("Summary");
    console.log("=".repeat(60));
    console.log(`✓ Database connection: OK`);
    console.log(`✓ Products accessible: ${productCount} products`);
    console.log(`✓ Table structure: OK`);
    console.log(`✓ Vector embeddings: ${vectorCount} / ${productCount} products`);
    
    if (productCount === 150 && vectorCount === productCount) {
      console.log("\n✅ SUCCESS: App has full access to 150 products with embeddings!");
    } else if (productCount === 150) {
      console.log("\n⚠️  WARNING: 150 products found, but some are missing vector embeddings");
    } else {
      console.log(`\n⚠️  WARNING: Expected 150 products, found ${productCount}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("Finished at:", new Date().toISOString());
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ ERROR accessing database:");
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkProductsAccess().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

