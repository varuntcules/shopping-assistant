/**
 * Blocker Detection Module
 * 
 * Detects decision blockers (ambiguity triggers) that prevent confident recommendations.
 * Blockers drive the conversation - when blockers exist, we ask questions.
 * When no blockers remain, we show products with tradeoffs.
 * 
 * Key concepts:
 * - Blockers are derived from missing required info OR product ambiguity_triggers
 * - Questions should eliminate the largest number of wrong recommendations
 * - Questions should unlock the biggest decision branch
 */

import { EnrichedProduct } from "./enrichedSearch";

/**
 * Conversation state for camera/accessories domain
 * Matches the database schema: conversation_state table
 */
export interface ConversationState {
  // Budget range - matches budget_min, budget_max columns
  budget_min: number | null;
  budget_max: number | null;

  // Skill level - matches skill_level column
  // beginner, intermediate, pro, expert
  skill_level: string | null;

  // Preferences - matches preferences JSONB column
  // Stores: use_case, portability_preference, additional_context
  preferences: {
    use_case?: string;  // Primary use case (travel_vlogging, studio_photography, etc.)
    portability?: "portable" | "quality" | "balanced";
    additional_context?: string;
  } | null;
}

/**
 * Blocker types in order of priority
 * Higher priority blockers eliminate more wrong recommendations
 */
export enum BlockerType {
  MISSING_USE_CASE = "MISSING_USE_CASE",           // ~80% elimination
  BUDGET_UNCLEAR = "BUDGET_UNCLEAR",               // ~60% elimination
  SKILL_MISMATCH = "SKILL_MISMATCH",               // ~40% elimination
  PORTABILITY_TRADEOFF = "PORTABILITY_TRADEOFF",   // ~30% elimination
  AMBIGUITY_FROM_PRODUCT = "AMBIGUITY_FROM_PRODUCT", // Product-specific blocker
}

/**
 * A blocker that prevents confident recommendation
 */
export interface Blocker {
  type: BlockerType;
  priority: number; // 1 = highest priority
  reason: string;   // Human-readable explanation
  source: "state" | "product"; // Where the blocker came from
  relatedProducts?: number[]; // Product IDs that triggered this blocker
  suggestedChips?: string[]; // Quick response options
}

/**
 * Priority ordering for blockers
 * Lower number = higher priority = should ask first
 */
const BLOCKER_PRIORITY: Record<BlockerType, number> = {
  [BlockerType.MISSING_USE_CASE]: 1,
  [BlockerType.BUDGET_UNCLEAR]: 2,
  [BlockerType.SKILL_MISMATCH]: 3,
  [BlockerType.PORTABILITY_TRADEOFF]: 4,
  [BlockerType.AMBIGUITY_FROM_PRODUCT]: 5,
};

/**
 * Check if a use case is valid/specific enough
 */
function isValidUseCase(state: ConversationState): boolean {
  const useCase = state.preferences?.use_case;
  if (!useCase) return false;
  const normalized = useCase.toLowerCase().trim();
  
  // Reject vague or empty use cases
  const vagueTerms = [
    "camera", "photography", "video", "recording", 
    "good", "best", "nice", "something", "anything",
    "general", "all", "everything"
  ];
  
  // Check if it's just a vague term
  if (vagueTerms.includes(normalized)) return false;
  
  // Should be at least a few words describing specific use
  return normalized.length >= 5;
}

/**
 * Check if budget is specified
 */
function hasBudget(state: ConversationState): boolean {
  return state.budget_min !== null || state.budget_max !== null;
}

/**
 * Analyze candidate products for skill level spread
 * Returns true if products span multiple skill levels significantly
 */
function hasSkillLevelSpread(products: EnrichedProduct[]): boolean {
  if (products.length < 2) return false;
  
  const skillLevels = new Set(
    products
      .map((p) => p.skillLevel)
      .filter((s): s is string => s !== null)
  );
  
  // If we have beginner AND (pro OR expert), there's a significant spread
  const hasBeginner = skillLevels.has("beginner");
  const hasAdvanced = skillLevels.has("pro") || skillLevels.has("expert");
  
  return hasBeginner && hasAdvanced;
}

/**
 * Analyze products for portability tradeoffs
 * Returns true if there's a significant mix of portable vs non-portable products
 */
function hasPortabilityTradeoff(products: EnrichedProduct[]): boolean {
  if (products.length < 2) return false;
  
  const portableCount = products.filter(
    (p) => p.portabilityScore !== null && p.portabilityScore <= 2
  ).length;
  
  const studioCount = products.filter(
    (p) => p.portabilityScore !== null && p.portabilityScore >= 4
  ).length;
  
  // Significant tradeoff if both types are present
  return portableCount > 0 && studioCount > 0;
}

/**
 * Extract common ambiguity triggers from products
 * Groups similar triggers and returns the most common ones
 */
function extractCommonAmbiguityTriggers(
  products: EnrichedProduct[]
): { trigger: string; count: number; productIds: number[] }[] {
  const triggerMap = new Map<string, { count: number; productIds: number[] }>();
  
  for (const product of products) {
    for (const trigger of product.ambiguityTriggers) {
      const normalized = trigger.toLowerCase().trim();
      const existing = triggerMap.get(normalized);
      
      if (existing) {
        existing.count++;
        existing.productIds.push(product.variantId);
      } else {
        triggerMap.set(normalized, { count: 1, productIds: [product.variantId] });
      }
    }
  }
  
  // Return triggers that appear in multiple products or are significant
  return Array.from(triggerMap.entries())
    .map(([trigger, data]) => ({ trigger, ...data }))
    .filter((t) => t.count >= 1) // Include all for now
    .sort((a, b) => b.count - a.count);
}

/**
 * Check if user's stated purpose might conflict with products' not_best_for
 */
function checkNotBestForConflicts(
  state: ConversationState,
  products: EnrichedProduct[]
): { product: EnrichedProduct; conflicts: string[] }[] {
  if (!state.primaryUseCase) return [];
  
  const useCaseLower = state.primaryUseCase.toLowerCase();
  const conflicts: { product: EnrichedProduct; conflicts: string[] }[] = [];
  
  for (const product of products) {
    const productConflicts = product.notBestFor.filter((nbf) => {
      const nbfLower = nbf.toLowerCase();
      // Check for keyword overlap
      const useCaseWords = useCaseLower.split(/\s+/);
      return useCaseWords.some((word) => word.length > 3 && nbfLower.includes(word));
    });
    
    if (productConflicts.length > 0) {
      conflicts.push({ product, conflicts: productConflicts });
    }
  }
  
  return conflicts;
}

/**
 * Main blocker detection function
 * 
 * Analyzes conversation state and candidate products to identify blockers.
 * Returns blockers sorted by priority (highest priority first).
 */
export function detectBlockers(
  state: ConversationState,
  candidateProducts: EnrichedProduct[]
): Blocker[] {
  const blockers: Blocker[] = [];
  
  // 1. Check for missing required state fields
  
  // MISSING_USE_CASE - highest priority
  if (!isValidUseCase(state.primaryUseCase)) {
    blockers.push({
      type: BlockerType.MISSING_USE_CASE,
      priority: BLOCKER_PRIORITY[BlockerType.MISSING_USE_CASE],
      reason: "Primary use case not specified. This eliminates ~80% of wrong recommendations.",
      source: "state",
      suggestedChips: [
        "Travel vlogging",
        "Studio photography",
        "Wildlife/nature",
        "Events & weddings",
        "Product photography",
      ],
    });
  }
  
  // BUDGET_UNCLEAR - second highest priority
  if (!hasBudget(state.budget)) {
    blockers.push({
      type: BlockerType.BUDGET_UNCLEAR,
      priority: BLOCKER_PRIORITY[BlockerType.BUDGET_UNCLEAR],
      reason: "Budget range unknown. This eliminates ~60% of wrong recommendations.",
      source: "state",
      suggestedChips: [
        "Under ₹25,000",
        "₹25,000 - 50,000",
        "₹50,000 - 1 Lakh",
        "Above ₹1 Lakh",
      ],
    });
  }
  
  // 2. Analyze candidate products for potential issues
  
  // Only check product-related blockers if we have candidates
  if (candidateProducts.length > 0) {
    // SKILL_MISMATCH - check if skill level is needed
    if (!state.skillLevel && hasSkillLevelSpread(candidateProducts)) {
      blockers.push({
        type: BlockerType.SKILL_MISMATCH,
        priority: BLOCKER_PRIORITY[BlockerType.SKILL_MISMATCH],
        reason: "Products span multiple skill levels. Clarifying experience level will help narrow options.",
        source: "state",
        suggestedChips: [
          "Just starting out",
          "Some experience",
          "Professional/advanced",
        ],
      });
    }
    
    // PORTABILITY_TRADEOFF - check if portability preference is needed
    if (!state.portabilityPreference && hasPortabilityTradeoff(candidateProducts)) {
      blockers.push({
        type: BlockerType.PORTABILITY_TRADEOFF,
        priority: BLOCKER_PRIORITY[BlockerType.PORTABILITY_TRADEOFF],
        reason: "Products have significant portability differences. Understanding preference will help.",
        source: "state",
        suggestedChips: [
          "Lightweight & portable",
          "Best quality, size doesn't matter",
          "Balance of both",
        ],
      });
    }
    
    // AMBIGUITY_FROM_PRODUCT - check product ambiguity triggers
    const commonTriggers = extractCommonAmbiguityTriggers(candidateProducts);
    
    // Only create blockers for significant ambiguity triggers
    // that relate to missing state information
    for (const { trigger, productIds } of commonTriggers.slice(0, 2)) {
      // Check if this trigger relates to something we should ask about
      const triggerLower = trigger.toLowerCase();
      
      const isRelevantTrigger = 
        triggerLower.includes("experience") ||
        triggerLower.includes("skill") ||
        triggerLower.includes("budget") ||
        triggerLower.includes("use case") ||
        triggerLower.includes("purpose") ||
        triggerLower.includes("specific") ||
        triggerLower.includes("unclear");
      
      if (isRelevantTrigger) {
        blockers.push({
          type: BlockerType.AMBIGUITY_FROM_PRODUCT,
          priority: BLOCKER_PRIORITY[BlockerType.AMBIGUITY_FROM_PRODUCT],
          reason: `Product data indicates: "${trigger}"`,
          source: "product",
          relatedProducts: productIds,
        });
      }
    }
  }
  
  // Sort by priority (lower number = higher priority)
  blockers.sort((a, b) => a.priority - b.priority);
  
  return blockers;
}

/**
 * Check if we have enough information to make recommendations
 * This is the inverse of having high-priority blockers
 */
export function canRecommend(
  state: ConversationState,
  candidateProducts: EnrichedProduct[]
): boolean {
  const blockers = detectBlockers(state, candidateProducts);
  
  // Can recommend if no blockers, OR only low-priority blockers remain
  // (priority > 3 means PORTABILITY_TRADEOFF or AMBIGUITY_FROM_PRODUCT)
  const hasHighPriorityBlockers = blockers.some((b) => b.priority <= 2);
  
  return !hasHighPriorityBlockers;
}

/**
 * Get the highest priority blocker for questioning
 */
export function getTopBlocker(blockers: Blocker[]): Blocker | null {
  if (blockers.length === 0) return null;
  
  // Already sorted by priority
  return blockers[0];
}

/**
 * Extract unique tradeoffs from candidate products
 * Used when showing products (no blockers)
 */
export function extractTradeoffs(
  products: EnrichedProduct[]
): { productId: number; tradeoffs: string[] }[] {
  return products.map((p) => ({
    productId: p.variantId,
    tradeoffs: p.tradeoffs,
  }));
}

/**
 * Create initial empty conversation state
 */
export function createInitialState(): ConversationState {
  return {
    primaryUseCase: null,
    budget: null,
    skillLevel: null,
    portabilityPreference: null,
  };
}

/**
 * Update conversation state from extracted values
 */
export function updateState(
  current: ConversationState,
  updates: Partial<ConversationState>
): ConversationState {
  return {
    ...current,
    ...updates,
    // Merge budget if both exist
    budget: updates.budget !== undefined 
      ? updates.budget 
      : current.budget,
  };
}

