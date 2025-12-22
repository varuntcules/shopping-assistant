/**
 * Product Sync Script
 * 
 * Run this script to sync products from Shopify Admin API to the local knowledge base.
 * 
 * Usage:
 *   npx tsx scripts/sync-products.ts
 * 
 * For cron jobs:
 *   0 2 * * * cd /path/to/shopping-assistant && npx tsx scripts/sync-products.ts >> sync.log 2>&1
 */

import dotenv from "dotenv";
import path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { syncProducts, getStatus } from "../lib/knowledgeBase";

async function main() {
  console.log("=".repeat(60));
  console.log("Product Sync Script");
  console.log("Started at:", new Date().toISOString());
  console.log("=".repeat(60));
  
  // Check current status
  const statusBefore = await getStatus();
  console.log("\nCurrent status:");
  console.log("  - Initialized:", statusBefore.initialized);
  console.log("  - Product count:", statusBefore.productCount);
  
  // Run sync
  console.log("\nStarting sync...");
  const result = await syncProducts();
  
  if (result.success) {
    console.log("\n✅ Sync completed successfully!");
    console.log("  - Products processed:", result.productsProcessed);
    console.log("  - Products indexed:", result.productsIndexed);
    console.log("  - Duration:", result.durationMs, "ms");
  } else {
    console.error("\n❌ Sync failed!");
    console.error("  - Error:", result.error);
    console.error("  - Duration:", result.durationMs, "ms");
    process.exit(1);
  }
  
  // Check status after
  const statusAfter = await getStatus();
  console.log("\nNew status:");
  console.log("  - Initialized:", statusAfter.initialized);
  console.log("  - Product count:", statusAfter.productCount);
  
  console.log("\n" + "=".repeat(60));
  console.log("Finished at:", new Date().toISOString());
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

