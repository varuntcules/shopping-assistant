/**
 * Question Generator Module
 * 
 * Generates clarifying questions based on detected blockers.
 * Questions are designed to:
 * - Eliminate the largest number of wrong recommendations
 * - Unlock the biggest decision branch
 * 
 * Key principles:
 * - Use case question eliminates ~80% of catalog
 * - Budget question eliminates ~60% of catalog
 * - Skill level eliminates ~40% of catalog
 * - Portability preference eliminates ~30% of catalog
 */

import { Blocker, BlockerType, ConversationState } from "./blockerDetection";
import { EnrichedProduct } from "./enrichedSearch";

/**
 * Generated question with context
 */
export interface GeneratedQuestion {
  text: string;
  chips: string[];
  blockerType: BlockerType;
  eliminationRate: string; // Human-readable elimination info
  context?: string; // Additional context for the assistant
}

/**
 * Question templates by blocker type
 */
interface QuestionTemplate {
  questions: string[];
  chips: string[];
  eliminationRate: string;
  contextBuilder?: (products: EnrichedProduct[]) => string;
}

const QUESTION_TEMPLATES: Record<BlockerType, QuestionTemplate> = {
  [BlockerType.MISSING_USE_CASE]: {
    questions: [
      "What will you primarily use this for?",
      "What kind of shooting are you planning to do?",
      "What's the main purpose you have in mind?",
    ],
    chips: [
      "Travel vlogging",
      "Studio photography",
      "Wildlife/nature",
      "Events & weddings",
      "Product photography",
    ],
    eliminationRate: "~80% of wrong options",
    contextBuilder: (products) => {
      if (products.length === 0) return "";
      // Summarize use cases from candidate products
      const useCases = new Set<string>();
      for (const p of products.slice(0, 5)) {
        for (const uc of p.useCases.slice(0, 2)) {
          useCases.add(uc.replace(/_/g, " "));
        }
      }
      if (useCases.size > 0) {
        return `Some options available: ${Array.from(useCases).slice(0, 4).join(", ")}`;
      }
      return "";
    },
  },

  [BlockerType.BUDGET_UNCLEAR]: {
    questions: [
      "What's your budget range?",
      "How much are you looking to spend?",
      "What budget do you have in mind?",
    ],
    chips: [
      "Under ₹25,000",
      "₹25,000 - 50,000",
      "₹50,000 - 1 Lakh",
      "Above ₹1 Lakh",
    ],
    eliminationRate: "~60% of wrong options",
    contextBuilder: (products) => {
      if (products.length === 0) return "";
      // Show price range of candidates
      const prices = products.map((p) => p.price).filter((p) => p > 0);
      if (prices.length === 0) return "";
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return `Current options range from ₹${min.toLocaleString()} to ₹${max.toLocaleString()}`;
    },
  },

  [BlockerType.SKILL_MISMATCH]: {
    questions: [
      "What's your experience level with cameras?",
      "How would you describe your photography/video experience?",
      "Are you just starting out or do you have some experience?",
    ],
    chips: [
      "Just starting out",
      "Some experience",
      "Professional/advanced",
    ],
    eliminationRate: "~40% of wrong options",
    contextBuilder: (products) => {
      if (products.length === 0) return "";
      // Show skill levels available
      const skills = new Set(
        products
          .map((p) => p.skillLevel)
          .filter((s): s is string => s !== null)
      );
      if (skills.size > 1) {
        return `Options range from ${Array.from(skills).join(" to ")} level`;
      }
      return "";
    },
  },

  [BlockerType.PORTABILITY_TRADEOFF]: {
    questions: [
      "What matters more to you - portability or quality?",
      "Do you need something lightweight for travel, or is quality the priority?",
      "Would you prefer a compact setup or the best quality regardless of size?",
    ],
    chips: [
      "Lightweight & portable",
      "Best quality, size doesn't matter",
      "Balance of both",
    ],
    eliminationRate: "~30% of wrong options",
    contextBuilder: (products) => {
      if (products.length === 0) return "";
      const portable = products.filter(
        (p) => p.portabilityScore !== null && p.portabilityScore <= 2
      ).length;
      const studio = products.filter(
        (p) => p.portabilityScore !== null && p.portabilityScore >= 4
      ).length;
      if (portable > 0 && studio > 0) {
        return `We have ${portable} portable options and ${studio} studio-grade options`;
      }
      return "";
    },
  },

  [BlockerType.AMBIGUITY_FROM_PRODUCT]: {
    questions: [
      "Could you tell me a bit more about your specific needs?",
      "What's most important to you in this purchase?",
      "Is there anything specific you're looking for?",
    ],
    chips: [
      "Best value for money",
      "Top quality",
      "Easy to use",
      "Versatile",
    ],
    eliminationRate: "varies by context",
  },
};

/**
 * Select a random question from templates
 */
function selectRandomQuestion(questions: string[]): string {
  const index = Math.floor(Math.random() * questions.length);
  return questions[index];
}

/**
 * Customize chips based on available products
 */
function customizeChips(
  defaultChips: string[],
  blockerType: BlockerType,
  products: EnrichedProduct[]
): string[] {
  // For use case, try to extract from products
  if (blockerType === BlockerType.MISSING_USE_CASE && products.length > 0) {
    const useCases = new Set<string>();
    for (const p of products) {
      for (const uc of p.useCases) {
        // Convert snake_case to Title Case
        const formatted = uc
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        useCases.add(formatted);
      }
    }
    if (useCases.size >= 3) {
      return Array.from(useCases).slice(0, 5);
    }
  }

  // For budget, adjust based on product prices
  if (blockerType === BlockerType.BUDGET_UNCLEAR && products.length > 0) {
    const prices = products.map((p) => p.price).filter((p) => p > 0);
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      
      // Generate dynamic budget chips
      const chips: string[] = [];
      if (min < 25000) chips.push("Under ₹25,000");
      if (min < 50000 && max > 25000) chips.push("₹25,000 - 50,000");
      if (min < 100000 && max > 50000) chips.push("₹50,000 - 1 Lakh");
      if (max > 100000) chips.push("Above ₹1 Lakh");
      
      if (chips.length >= 2) {
        return chips;
      }
    }
  }

  return defaultChips;
}

/**
 * Generate a question for a specific blocker
 */
export function generateQuestion(
  blocker: Blocker,
  candidateProducts: EnrichedProduct[] = []
): GeneratedQuestion {
  const template = QUESTION_TEMPLATES[blocker.type];
  
  // Use blocker's suggested chips if available, otherwise use template
  const chips = blocker.suggestedChips || 
    customizeChips(template.chips, blocker.type, candidateProducts);
  
  // Build context from products if available
  const context = template.contextBuilder 
    ? template.contextBuilder(candidateProducts) 
    : undefined;

  return {
    text: selectRandomQuestion(template.questions),
    chips,
    blockerType: blocker.type,
    eliminationRate: template.eliminationRate,
    context,
  };
}

/**
 * Generate questions for all blockers (for UI preview)
 */
export function generateAllQuestions(
  blockers: Blocker[],
  candidateProducts: EnrichedProduct[] = []
): GeneratedQuestion[] {
  return blockers.map((blocker) => generateQuestion(blocker, candidateProducts));
}

/**
 * Get a warm, conversational acknowledgment for the user's response
 */
export function getAcknowledgment(
  blockerType: BlockerType,
  userResponse: string
): string {
  const acknowledgments: Record<BlockerType, string[]> = {
    [BlockerType.MISSING_USE_CASE]: [
      `Great, ${userResponse.toLowerCase()} - that helps a lot!`,
      `Got it, you're looking for something for ${userResponse.toLowerCase()}.`,
      `Perfect, ${userResponse.toLowerCase()} is a great use case.`,
    ],
    [BlockerType.BUDGET_UNCLEAR]: [
      `Great, I'll focus on options in that range.`,
      `Got it, that budget gives us some nice options.`,
      `Perfect, let me find the best options in your budget.`,
    ],
    [BlockerType.SKILL_MISMATCH]: [
      `Thanks for sharing that! I'll recommend accordingly.`,
      `Great, I'll keep your experience level in mind.`,
      `Got it, that helps me narrow down the options.`,
    ],
    [BlockerType.PORTABILITY_TRADEOFF]: [
      `That makes sense! I'll prioritize that.`,
      `Good to know, I'll factor that into my recommendations.`,
      `Perfect, that helps me pick the right options.`,
    ],
    [BlockerType.AMBIGUITY_FROM_PRODUCT]: [
      `Thanks for clarifying!`,
      `Got it, that helps.`,
      `Perfect, I understand better now.`,
    ],
  };

  const options = acknowledgments[blockerType] || ["Thanks!"];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Parse user response to update state
 */
export function parseUserResponse(
  blockerType: BlockerType,
  userResponse: string
): Partial<ConversationState> {
  const response = userResponse.toLowerCase().trim();

  switch (blockerType) {
    case BlockerType.MISSING_USE_CASE:
      // Return the use case as-is for semantic matching
      return { primaryUseCase: userResponse.trim() };

    case BlockerType.BUDGET_UNCLEAR:
      // Parse budget from response
      return { budget: parseBudgetFromResponse(response) };

    case BlockerType.SKILL_MISMATCH:
      // Map to skill level
      return { skillLevel: parseSkillFromResponse(response) };

    case BlockerType.PORTABILITY_TRADEOFF:
      // Map to portability preference
      return { portabilityPreference: parsePortabilityFromResponse(response) };

    default:
      return { additionalContext: userResponse };
  }
}

/**
 * Parse budget from user response
 */
function parseBudgetFromResponse(
  response: string
): { min?: number; max?: number } | null {
  // Remove currency symbols and commas
  const normalized = response.replace(/[₹,]/g, "").toLowerCase();

  // Check for "under" or "below"
  const underMatch = normalized.match(/under\s*(\d+(?:k|000)?)/);
  if (underMatch) {
    const max = parseNumberWithK(underMatch[1]);
    return { max };
  }

  // Check for "above" or "over"
  const aboveMatch = normalized.match(/(above|over)\s*(\d+(?:k|000)?)/);
  if (aboveMatch) {
    const min = parseNumberWithK(aboveMatch[2]);
    return { min };
  }

  // Check for range "X - Y" or "X to Y"
  const rangeMatch = normalized.match(
    /(\d+(?:k|000)?)\s*(?:-|to)\s*(\d+(?:k|lakh|000)?)/
  );
  if (rangeMatch) {
    const min = parseNumberWithK(rangeMatch[1]);
    const max = parseNumberWithK(rangeMatch[2]);
    return { min, max };
  }

  // Check for "lakh"
  if (normalized.includes("lakh") || normalized.includes("lac")) {
    const lakhMatch = normalized.match(/(\d+)\s*lakh/);
    if (lakhMatch) {
      const value = parseInt(lakhMatch[1]) * 100000;
      if (normalized.includes("above") || normalized.includes("over")) {
        return { min: value };
      }
      if (normalized.includes("under") || normalized.includes("below")) {
        return { max: value };
      }
      // Treat as max by default
      return { max: value };
    }
  }

  // Single number - treat as max
  const singleMatch = normalized.match(/(\d+(?:k|000)?)/);
  if (singleMatch) {
    const max = parseNumberWithK(singleMatch[1]);
    return { max };
  }

  return null;
}

/**
 * Parse number with K suffix
 */
function parseNumberWithK(str: string): number {
  const normalized = str.toLowerCase().replace(/,/g, "");
  
  if (normalized.includes("lakh") || normalized.includes("lac")) {
    return parseFloat(normalized) * 100000;
  }
  
  if (normalized.endsWith("k")) {
    return parseFloat(normalized) * 1000;
  }
  
  if (normalized.endsWith("000")) {
    return parseFloat(normalized);
  }
  
  const num = parseFloat(normalized);
  // Assume larger numbers are already in full form
  if (num < 1000) {
    return num * 1000; // Assume K
  }
  return num;
}

/**
 * Parse skill level from response
 */
function parseSkillFromResponse(response: string): string {
  const normalized = response.toLowerCase();

  if (
    normalized.includes("start") ||
    normalized.includes("beginner") ||
    normalized.includes("new") ||
    normalized.includes("first")
  ) {
    return "beginner";
  }

  if (
    normalized.includes("some") ||
    normalized.includes("intermediate") ||
    normalized.includes("hobby")
  ) {
    return "intermediate";
  }

  if (
    normalized.includes("professional") ||
    normalized.includes("advanced") ||
    normalized.includes("pro") ||
    normalized.includes("expert")
  ) {
    return "pro";
  }

  // Default to intermediate if unclear
  return "intermediate";
}

/**
 * Parse portability preference from response
 */
function parsePortabilityFromResponse(
  response: string
): "portable" | "quality" | "balanced" {
  const normalized = response.toLowerCase();

  if (
    normalized.includes("light") ||
    normalized.includes("portable") ||
    normalized.includes("travel") ||
    normalized.includes("compact")
  ) {
    return "portable";
  }

  if (
    normalized.includes("quality") ||
    normalized.includes("best") ||
    normalized.includes("doesn't matter") ||
    normalized.includes("studio")
  ) {
    return "quality";
  }

  return "balanced";
}




