import type { ChatMessage } from "@/lib/types";
import { generateEmbedding } from "@/lib/embeddings";
import { searchByVector, type ProductRecord, isInitialized } from "@/lib/vectorStore";
import * as fs from "fs";
import * as path from "path";

// Load purpose attribute map
const purposeAttributeMapPath = path.join(process.cwd(), "rag", "purpose_attribute_map.json");
const purposeAttributeMap = JSON.parse(fs.readFileSync(purposeAttributeMapPath, "utf-8"));

// Types matching schema.json
export interface UserIntent {
  purpose: "travel_vlogging" | "beginner_photography" | "low_light_events" | null;
  budget: {
    min: number | null;
    max: number | null;
    currency: string;
  } | null;
  category: string | null;
  key_attributes: Record<string, unknown>;
  comparison_request: string[] | null;
}

export interface ProductSemanticProfile {
  product_id: string;
  title: string;
  category: string;
  price: {
    value: number;
    currency: string;
    as_of: string;
  } | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  key_attributes: Record<string, unknown>;
  use_case_fit: {
    travel_vlogging?: "high" | "medium" | "low" | "unknown";
    beginner_photography?: "high" | "medium" | "low" | "unknown";
    low_light_events?: "high" | "medium" | "low" | "unknown";
  };
  proof: string[];
}

export interface ClarifyingQuestion {
  text: string;
  options: string[];
}

export interface Recommendation {
  product_id: string;
  title: string;
  price: {
    value: number;
    currency: string;
    as_of: string;
  } | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  why_it_fits: string[];
  tradeoffs: string[];
  confidence: "high" | "medium" | "low";
  proof: string[];
}

export interface Comparison {
  product_a: Recommendation;
  product_b: Recommendation;
  differences: string[];
  best_for: {
    a: string[];
    b: string[];
  };
}

export interface AgentResponse {
  mode: "clarify" | "recommend" | "compare" | "fail";
  intent: UserIntent;
  clarifying_question: ClarifyingQuestion | null;
  recommendations: Recommendation[];
  comparison: Comparison | null;
  errors: string[];
}

// Optional in-memory cache for vector search results (session-based)
let productCache: { key: string; products: ProductRecord[]; timestamp: number } | null =
  null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Parse user intent from chat messages
 */
export function parseUserIntent(messages: ChatMessage[]): UserIntent {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const allText = messages.map((m) => m.content).join(" ").toLowerCase();

  // Extract purpose
  let purpose: UserIntent["purpose"] = null;
  if (allText.includes("travel") && allText.includes("vlog")) {
    purpose = "travel_vlogging";
  } else if (allText.includes("beginner") || allText.includes("learning")) {
    purpose = "beginner_photography";
  } else if (allText.includes("low light") || allText.includes("night") || allText.includes("event")) {
    purpose = "low_light_events";
  }

  // Extract budget
  let budget: UserIntent["budget"] = null;
  const budgetMatch = allText.match(/(?:under|below|max|upto|up to)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:k|thousand)?)/i);
  const budgetMinMatch = allText.match(/(?:above|over|min|from)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:k|thousand)?)/i);
  
  if (budgetMatch || budgetMinMatch) {
    const maxStr = budgetMatch?.[1]?.replace(/,/g, "").replace(/k|thousand/i, "000");
    const minStr = budgetMinMatch?.[1]?.replace(/,/g, "").replace(/k|thousand/i, "000");
    budget = {
      min: minStr ? parseInt(minStr, 10) : null,
      max: maxStr ? parseInt(maxStr, 10) : null,
      currency: "INR",
    };
  }

  // Extract category (simple keyword matching)
  let category: string | null = null;
  const categoryKeywords: Record<string, string> = {
    camera: "Camera",
    lens: "Lens",
    tripod: "Tripod",
    microphone: "Microphone",
    bag: "Bag",
  };
  for (const [keyword, cat] of Object.entries(categoryKeywords)) {
    if (allText.includes(keyword)) {
      category = cat;
      break;
    }
  }

  // Extract comparison request (look for "compare", "vs", "difference")
  let comparison_request: string[] | null = null;
  if (allText.includes("compare") || allText.includes(" vs ") || allText.includes("difference")) {
    // Will be populated when we have product IDs
    comparison_request = [];
  }

  return {
    purpose,
    budget,
    category,
    key_attributes: {}, // Will be populated based on purpose
    comparison_request,
  };
}

/**
 * Decide if we need to ask a clarifying question
 */
export function decideNextQuestion(intent: UserIntent): ClarifyingQuestion | null {
  const purposeMap = purposeAttributeMap as Record<string, {
    recommended_clarifying_questions: string[];
  }>;

  // If no purpose, ask about purpose
  if (!intent.purpose) {
    return {
      text: "What will you primarily use this camera for?",
      options: [
        "Travel vlogging",
        "Beginner photography",
        "Low light events",
        "Something else",
      ],
    };
  }

  // If no budget, ask about budget
  if (!intent.budget || (!intent.budget.min && !intent.budget.max)) {
    const questions = purposeMap[intent.purpose]?.recommended_clarifying_questions || [];
    const budgetQuestion = questions.find((q) => q.toLowerCase().includes("budget"));
    if (budgetQuestion) {
      return {
        text: budgetQuestion,
        options: ["Under 20,000", "20,000 - 50,000", "50,000 - 1,00,000", "Above 1,00,000"],
      };
    }
  }

  // If purpose is set but we need more details, ask a relevant question
  const questions = purposeMap[intent.purpose]?.recommended_clarifying_questions || [];
  if (questions.length > 0) {
    // Skip budget questions if already answered
    const nonBudgetQuestions = questions.filter((q) => !q.toLowerCase().includes("budget"));
    if (nonBudgetQuestions.length > 0) {
      return {
        text: nonBudgetQuestions[0],
        options: [], // Can be empty for open-ended questions
      };
    }
  }

  return null;
}

/**
 * Fetch products from the vector store using semantic search
 * Uses the user's latest message as the query text and applies
 * budget + category filters from the parsed intent.
 */
export async function fetchCatalogSubset(
  intent: UserIntent,
  messages: ChatMessage[],
): Promise<ProductRecord[]> {
  // Ensure vector store is initialized
  const initialized = await isInitialized();
  if (!initialized) {
    console.log("[Reasoning] Vector store not initialized, returning empty results");
    return [];
  }

  // Build a simple cache key from purpose + budget + category + last message
  const lastMessage = messages[messages.length - 1]?.content || "";
  const cacheKey = JSON.stringify({
    purpose: intent.purpose,
    budget: intent.budget,
    category: intent.category,
    lastMessage,
  });

  if (productCache && Date.now() - productCache.timestamp < CACHE_TTL) {
    if (productCache.key === cacheKey) {
      console.log("[Reasoning] Using cached vector search results");
      return productCache.products;
    }
  }

  console.log("[Reasoning] Performing vector search for catalog subset");

  // Generate embedding for the user's latest message
  const queryText = lastMessage || "";
  const queryVector = await generateEmbedding(queryText);

  const minPrice = intent.budget?.min ?? undefined;
  const maxPrice = intent.budget?.max ?? undefined;

  // Retrieve candidates from vector store
  const records = await searchByVector(queryVector, {
    limit: 24,
    minPrice,
    maxPrice,
  });

  // Optional: filter by category using productType
  let filtered = records;
  if (intent.category) {
    const cat = intent.category.toLowerCase();
    filtered = filtered.filter((r) => r.productType.toLowerCase().includes(cat));
  }

  productCache = {
    key: cacheKey,
    products: filtered,
    timestamp: Date.now(),
  };

  return filtered;
}

/**
 * Normalize a ProductRecord from the vector store to ProductSemanticProfile
 * Extract only what exists; mark as "unknown" otherwise
 */
export function normalizeProduct(record: ProductRecord): ProductSemanticProfile {
  const price = typeof record.price === "number" ? record.price : null;

  // Extract attributes from description, tags, and embedding text
  const descriptionText = (record.description || "").toLowerCase();
  const tagsText = (record.allTags || "").toLowerCase();
  const embeddingText = (record.embeddingText || "").toLowerCase();
  const allText = `${descriptionText} ${tagsText} ${embeddingText}`;

  const attributes: Record<string, unknown> = {};
  const proof: string[] = [];

  // Extract common camera attributes
  if (allText.includes("4k") || allText.includes("4 k")) {
    attributes.video_resolution = "4K";
    proof.push("description");
  } else if (allText.includes("1080p") || allText.includes("full hd")) {
    attributes.video_resolution = "1080p";
    proof.push("description");
  } else {
    attributes.video_resolution = "unknown";
  }

  if (allText.includes("full frame") || allText.includes("full-frame")) {
    attributes.sensor_size = "full_frame";
    proof.push("body_html");
  } else if (allText.includes("aps-c") || allText.includes("aps c")) {
    attributes.sensor_size = "aps_c";
    proof.push("body_html");
  } else {
    attributes.sensor_size = "unknown";
  }

  if (allText.includes("low light") || allText.includes("night")) {
    attributes.low_light_performance = "high";
    proof.push("description");
  } else {
    attributes.low_light_performance = "unknown";
  }

  // Extract weight if mentioned
  const weightMatch = allText.match(/(\d+)\s*(?:g|gram|grams|kg|kilogram)/i);
  if (weightMatch) {
    const weight = parseInt(weightMatch[1], 10);
    attributes.weight_grams = weight < 1000 ? weight : weight * 1000; // Convert kg to grams
    proof.push("body_html");
  } else {
    attributes.weight_grams = "unknown";
  }

  // Compute use case fit scores
  const useCaseFit: ProductSemanticProfile["use_case_fit"] = {};
  
  // Simple heuristic-based scoring
  if (attributes.weight_grams !== "unknown" && typeof attributes.weight_grams === "number" && attributes.weight_grams < 500) {
    useCaseFit.travel_vlogging = "high";
  } else if (attributes.video_resolution === "4K") {
    useCaseFit.travel_vlogging = "medium";
  } else {
    useCaseFit.travel_vlogging = "unknown";
  }

  if (attributes.low_light_performance === "high" || attributes.sensor_size === "full_frame") {
    useCaseFit.low_light_events = "high";
  } else {
    useCaseFit.low_light_events = "unknown";
  }

  // Beginner photography: simple heuristic (price-based for now)
  if (price && price < 50000) {
    useCaseFit.beginner_photography = "medium";
  } else {
    useCaseFit.beginner_photography = "unknown";
  }

  // Determine availability (assume in_stock if we have the product)
  const availability: ProductSemanticProfile["availability"] = "unknown";

  return {
    product_id: String(record.id),
    title: record.title,
    category: record.productType || "Unknown",
    price: price
      ? {
          value: price,
          currency: "INR",
          as_of: new Date().toISOString(),
        }
      : null,
    availability,
    key_attributes: attributes,
    use_case_fit: useCaseFit,
    proof: proof.length > 0 ? proof : ["title"],
  };
}

/**
 * Score a product against user intent
 */
export function scoreProduct(intent: UserIntent, profile: ProductSemanticProfile): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  // If purpose is set, use use_case_fit
  if (intent.purpose) {
    const fit = profile.use_case_fit[intent.purpose];
    if (fit === "high") {
      score += 10;
      reasons.push(`Excellent fit for ${intent.purpose}`);
    } else if (fit === "medium") {
      score += 5;
      reasons.push(`Good fit for ${intent.purpose}`);
    } else if (fit === "low") {
      score += 1;
      reasons.push(`Limited fit for ${intent.purpose}`);
    }
  }

  // Match attributes from purpose map
  const purposeMap = purposeAttributeMap as Record<string, {
    top_attributes: string[];
    attribute_weights: Record<string, number>;
  }>;

  if (intent.purpose && purposeMap[intent.purpose]) {
    const weights = purposeMap[intent.purpose].attribute_weights;
    for (const [attr, weight] of Object.entries(weights)) {
      if (profile.key_attributes[attr] && profile.key_attributes[attr] !== "unknown") {
        score += weight * 10;
        reasons.push(`Has ${attr}: ${profile.key_attributes[attr]}`);
      }
    }
  }

  // Budget match bonus
  if (intent.budget && profile.price) {
    const price = profile.price.value;
    if (intent.budget.max && price <= intent.budget.max) {
      score += 5;
      reasons.push("Within budget");
    }
    if (intent.budget.min && price >= intent.budget.min) {
      score += 2;
    }
  }

  // Category match
  if (intent.category && profile.category.toLowerCase().includes(intent.category.toLowerCase())) {
    score += 3;
    reasons.push(`Matches category: ${profile.category}`);
  }

  return { score, reasons };
}

/**
 * Recommend top 2-3 products
 */
export function recommend(intent: UserIntent, profiles: ProductSemanticProfile[]): {
  recommendations: Recommendation[];
  confidence: "high" | "medium" | "low";
} {
  // Score all products
  const scored = profiles.map((profile) => {
    const { score, reasons } = scoreProduct(intent, profile);
    return { profile, score, reasons };
  });

  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);

  // Take top 2-3
  const topProducts = scored.slice(0, 3);

  // Convert to recommendations
  const recommendations: Recommendation[] = topProducts.map(({ profile, score, reasons }) => {
    // Determine confidence based on score
    let confidence: "high" | "medium" | "low" = "low";
    if (score >= 15) confidence = "high";
    else if (score >= 8) confidence = "medium";

    // Build why_it_fits from reasons
    const whyItFits = reasons.filter((r) => !r.includes("Within budget") && !r.includes("Matches category"));

    // Build tradeoffs (simplified - can be enhanced)
    const tradeoffs: string[] = [];
    if (profile.price && profile.price.value > 50000) {
      tradeoffs.push("Higher price point");
    }
    if (profile.key_attributes.weight_grams === "unknown") {
      tradeoffs.push("Weight information not available");
    }

    return {
      product_id: profile.product_id,
      title: profile.title,
      price: profile.price,
      availability: profile.availability,
      why_it_fits: whyItFits.length > 0 ? whyItFits : ["Matches your search criteria"],
      tradeoffs: tradeoffs.length > 0 ? tradeoffs : ["No major tradeoffs identified"],
      confidence,
      proof: profile.proof,
    };
  });

  // Overall confidence
  const avgScore = topProducts.reduce((sum, p) => sum + p.score, 0) / topProducts.length;
  let overallConfidence: "high" | "medium" | "low" = "low";
  if (avgScore >= 12) overallConfidence = "high";
  else if (avgScore >= 6) overallConfidence = "medium";

  return {
    recommendations,
    confidence: overallConfidence,
  };
}

/**
 * Compare two products
 */
export function compare(
  productA: ProductSemanticProfile,
  productB: ProductSemanticProfile,
  intent: UserIntent
): Comparison {
  const differences: string[] = [];
  const bestForA: string[] = [];
  const bestForB: string[] = [];

  // Compare price
  if (productA.price && productB.price) {
    if (productA.price.value < productB.price.value) {
      differences.push(`Product A is ₹${productB.price.value - productA.price.value} cheaper`);
      bestForA.push("Budget-conscious buyers");
    } else if (productB.price.value < productA.price.value) {
      differences.push(`Product B is ₹${productA.price.value - productB.price.value} cheaper`);
      bestForB.push("Budget-conscious buyers");
    }
  }

  // Compare attributes
  for (const [key, valueA] of Object.entries(productA.key_attributes)) {
    const valueB = productB.key_attributes[key];
    if (valueA !== "unknown" && valueB !== "unknown" && valueA !== valueB) {
      differences.push(`${key}: A has ${valueA}, B has ${valueB}`);
    }
  }

  // Compare use case fit
  if (intent.purpose) {
    const fitA = productA.use_case_fit[intent.purpose];
    const fitB = productB.use_case_fit[intent.purpose];
    if (fitA === "high" && fitB !== "high") {
      bestForA.push(intent.purpose);
    } else if (fitB === "high" && fitA !== "high") {
      bestForB.push(intent.purpose);
    }
  }

  // Convert to recommendations for comparison
  const recA: Recommendation = {
    product_id: productA.product_id,
    title: productA.title,
    price: productA.price,
    availability: productA.availability,
    why_it_fits: [],
    tradeoffs: [],
    confidence: "medium",
    proof: productA.proof,
  };

  const recB: Recommendation = {
    product_id: productB.product_id,
    title: productB.title,
    price: productB.price,
    availability: productB.availability,
    why_it_fits: [],
    tradeoffs: [],
    confidence: "medium",
    proof: productB.proof,
  };

  return {
    product_a: recA,
    product_b: recB,
    differences: differences.length > 0 ? differences : ["No significant differences found"],
    best_for: {
      a: bestForA.length > 0 ? bestForA : ["General use"],
      b: bestForB.length > 0 ? bestForB : ["General use"],
    },
  };
}

/**
 * Main reasoning function that orchestrates everything
 */
export async function reason(
  messages: ChatMessage[]
): Promise<AgentResponse> {
  const errors: string[] = [];

  try {
    // Step 1: Parse intent
    const intent = parseUserIntent(messages);

    // Step 2: Check if we need to ask a clarifying question
    const clarifyingQuestion = decideNextQuestion(intent);
    if (clarifyingQuestion) {
      return {
        mode: "clarify",
        intent,
        clarifying_question: clarifyingQuestion,
        recommendations: [],
        comparison: null,
        errors,
      };
    }

    // Step 3: Fetch products via vector store
    const products = await fetchCatalogSubset(intent, messages);
    if (products.length === 0) {
      return {
        mode: "fail",
        intent,
        clarifying_question: null,
        recommendations: [],
        comparison: null,
        errors: ["No products found matching criteria"],
      };
    }

    // Step 4: Normalize products
    const profiles = products.map(normalizeProduct);

    // Step 5: Handle comparison request
    if (intent.comparison_request && intent.comparison_request.length >= 2) {
      const productA = profiles.find((p) => p.product_id === intent.comparison_request![0]);
      const productB = profiles.find((p) => p.product_id === intent.comparison_request![1]);
      
      if (productA && productB) {
        const comparisonResult = compare(productA, productB, intent);
        return {
          mode: "compare",
          intent,
          clarifying_question: null,
          recommendations: [],
          comparison: comparisonResult,
          errors,
        };
      } else {
        errors.push("Could not find products for comparison");
      }
    }

    // Step 6: Recommend
    const { recommendations, confidence } = recommend(intent, profiles);
    
    if (recommendations.length === 0) {
      return {
        mode: "fail",
        intent,
        clarifying_question: null,
        recommendations: [],
        comparison: null,
        errors: ["No suitable recommendations found"],
      };
    }

    return {
      mode: "recommend",
      intent,
      clarifying_question: null,
      recommendations,
      comparison: null,
      errors,
    };
  } catch (error) {
    console.error("[Reasoning] Error:", error);
    return {
      mode: "fail",
      intent: {
        purpose: null,
        budget: null,
        category: null,
        key_attributes: {},
        comparison_request: null,
      },
      clarifying_question: null,
      recommendations: [],
      comparison: null,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

