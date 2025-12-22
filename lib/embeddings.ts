import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Gemini embedding model
const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSION = 768; // text-embedding-004 outputs 768-dim vectors

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return aiClient;
}

/**
 * Generate embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getAIClient();
  
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
    });

    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error("No embeddings returned from Gemini");
    }

    const embedding = result.embeddings[0].values;
    if (!embedding || embedding.length === 0) {
      throw new Error("Empty embedding values");
    }

    return embedding;
  } catch (error) {
    console.error("[Embeddings] Error generating embedding:", error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts (batched)
 * Returns array of embeddings in same order as input
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  // Process in batches to avoid rate limits
  const BATCH_SIZE = 10;
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((text) => generateEmbedding(text));
    
    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    } catch (error) {
      console.error(`[Embeddings] Batch ${i / BATCH_SIZE} failed:`, error);
      // Fill failed ones with zero vectors
      for (let j = 0; j < batch.length; j++) {
        results.push(new Array(EMBEDDING_DIMENSION).fill(0));
      }
    }
    
    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Create a searchable text representation from product data
 */
export function createProductEmbeddingText(product: {
  title: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  description?: string;
}): string {
  const parts: string[] = [product.title];
  
  if (product.vendor) {
    parts.push(product.vendor);
  }
  
  if (product.productType) {
    parts.push(product.productType);
  }
  
  if (product.tags && product.tags.length > 0) {
    parts.push(product.tags.join(", "));
  }
  
  if (product.description) {
    // Take first 200 chars of description to keep embedding focused
    const snippet = product.description.slice(0, 200).replace(/\s+/g, " ").trim();
    if (snippet) {
      parts.push(snippet);
    }
  }
  
  return parts.join(" | ");
}

export { EMBEDDING_DIMENSION };

