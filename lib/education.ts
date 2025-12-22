/**
 * Education & External Resources Module
 * 
 * This module provides utilities for fetching and formatting educational content
 * to help users make informed purchasing decisions.
 * 
 * Currently, externalTopics are passed through for future web search integration.
 * When web search is enabled, this module will handle fetching and summarizing
 * relevant information from authoritative sources.
 */

export interface ExternalResource {
  topic: string;
  title: string;
  url: string;
  snippet: string;
}

export interface EducationResult {
  topics: string[];
  resources: ExternalResource[];
  summary?: string;
}

/**
 * Placeholder for future web search integration.
 * 
 * When implemented, this function will:
 * 1. Take the externalTopics from the intent
 * 2. Perform web searches for each topic
 * 3. Extract relevant snippets and URLs
 * 4. Return formatted resources for display
 * 
 * For now, it returns the topics as-is for debugging/planning purposes.
 */
export async function lookupExternalResources(
  topics: string[]
): Promise<EducationResult> {
  // TODO: Integrate with web search API when available
  // For now, just pass through the topics for debugging
  
  console.log("[Education] External topics for future lookup:", topics);
  
  return {
    topics,
    resources: [], // Will be populated when web search is enabled
  };
}

/**
 * Format educational resources for display in the chat.
 * Returns a formatted string that can be appended to the assistant message.
 */
export function formatResourcesForDisplay(result: EducationResult): string {
  if (result.resources.length === 0) {
    return "";
  }
  
  const lines = ["📚 **Learn More:**"];
  
  for (const resource of result.resources.slice(0, 3)) {
    lines.push(`• [${resource.title}](${resource.url})`);
    if (resource.snippet) {
      lines.push(`  _${resource.snippet}_`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Check if external lookup should be performed based on the intent.
 * Returns true if there are topics and the feature is enabled.
 */
export function shouldLookupResources(
  topics: string[] | undefined,
  enabled: boolean = false // Feature flag for future enablement
): boolean {
  if (!enabled) return false;
  if (!topics || topics.length === 0) return false;
  return true;
}

/**
 * Common educational tips by category.
 * These can supplement or replace external lookups when not available.
 */
export const CATEGORY_TIPS: Record<string, string[]> = {
  shoes: [
    "Consider your primary use: running shoes differ significantly from casual or formal footwear.",
    "Proper fit matters more than brand - your feet should have about a thumb's width of space at the toe.",
    "Cushioning preferences vary: some prefer responsive (firmer) while others like plush (softer).",
  ],
  laptops: [
    "For coding and development, prioritize RAM (16GB+) and a good keyboard.",
    "Battery life matters for portability - look for 8+ hours of real-world usage.",
    "SSD storage is essential for speed; consider 512GB as a minimum for comfort.",
  ],
  headphones: [
    "Over-ear headphones typically offer better sound quality and comfort for long sessions.",
    "Active Noise Cancellation (ANC) is great for travel but drains battery faster.",
    "Wired headphones avoid latency issues for gaming and music production.",
  ],
  clothing: [
    "Natural fabrics like cotton breathe better but may wrinkle more easily.",
    "Consider care instructions - some materials require special washing.",
    "Fit and comfort often matter more than trends for everyday wear.",
  ],
  electronics: [
    "Check warranty terms and return policies before purchasing.",
    "Read recent reviews to catch any reliability issues with newer products.",
    "Consider ecosystem compatibility with your existing devices.",
  ],
};

/**
 * Get a relevant tip for a product category.
 */
export function getCategoryTip(query: string): string | undefined {
  const lowerQuery = query.toLowerCase();
  
  for (const [category, tips] of Object.entries(CATEGORY_TIPS)) {
    if (lowerQuery.includes(category) || 
        (category === "shoes" && (lowerQuery.includes("sneaker") || lowerQuery.includes("footwear"))) ||
        (category === "laptops" && (lowerQuery.includes("notebook") || lowerQuery.includes("computer")))) {
      // Return a random tip from the category
      return tips[Math.floor(Math.random() * tips.length)];
    }
  }
  
  return undefined;
}

