import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";
import { generateEmbeddingsBatch } from "../lib/embeddings";

async function main() {
  // Load environment variables from .env.local (same pattern as sync-products.ts)
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

  if (!databaseUrl) {
    console.error(
      "[embed-products-dummy] DATABASE_URL or SUPABASE_DB_URL must be set"
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DB_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    console.log("[embed-products-dummy] Fetching products with NULL vector...");

    const { rows } = await client.query<{
      id: string;
      embedding_text: string;
    }>(
      `
        SELECT id, embedding_text
        FROM public.products_dummy
        WHERE vector IS NULL
        ORDER BY id
      `
    );

    if (rows.length === 0) {
      console.log(
        "[embed-products-dummy] No products with NULL vector found. Nothing to do."
      );
      return;
    }

    console.log(
      `[embed-products-dummy] Found ${rows.length} products to embed.`
    );

    const BATCH_SIZE = 10;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const ids = batch.map((r) => r.id);
      const texts = batch.map((r) => r.embedding_text || "");

      console.log(
        `[embed-products-dummy] Embedding batch ${
          i / BATCH_SIZE + 1
        } (${batch.length} items)...`
      );

      let embeddings: number[][];

      try {
        embeddings = await generateEmbeddingsBatch(texts);
      } catch (err) {
        console.error(
          "[embed-products-dummy] Error generating embeddings for batch, skipping ids:",
          ids,
          err
        );
        continue;
      }

      // Update each product's vector
      const updateText = `
        UPDATE public.products_dummy
        SET vector = $1::vector
        WHERE id = $2
      `;

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        const id = ids[j];

        try {
          await client.query(updateText, [JSON.stringify(embedding), id]);
        } catch (err) {
          console.error(
            `[embed-products-dummy] Failed to update vector for product ${id}:`,
            err
          );
        }
      }
    }

    console.log("[embed-products-dummy] Done embedding products_dummy.");
  } catch (error) {
    console.error("[embed-products-dummy] Fatal error:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();


