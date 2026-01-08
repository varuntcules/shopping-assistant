// Chat message types
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
  ui?: AssistantUIModel;
  confidence?: number; // 0-1 confidence score (only for assistant messages)
  generatedUI?: GeneratedUIBlock[]; // Generative UI blocks from model-driven tools
}

// Product card for display
export interface ProductCard {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  price: {
    amount: string;
    currencyCode: string;
  };
  image: {
    url: string;
    altText: string | null;
  };
  url: string;
}

// UI mode for distinguishing educational vs shopping turns
export type UIMode = "education" | "shopping";

// UI model from assistant
export interface AssistantUIModel {
  layout: "grid";
  title: string;
  mode?: UIMode; // Optional mode to distinguish educational/follow-up turns
  retailUI?: {
    type: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
    chips?: string[];
    comparison?: {
      productA: RetailProduct;
      productB: RetailProduct;
      tradeoffs: string[];
    };
    checkout?: {
      items: RetailProduct[];
      total: number;
    };
  };
}

// Generative UI blocks produced by model-driven tools
export type GeneratedUIBlock =
  | {
      kind: "education";
      title?: string;
      body?: string;
      sections?: Array<{ title: string; description: string }>;
      bullets?: string[];
    }
  | {
      kind: "comparison";
      summary?: string;
      items: Array<{
        title: string;
        price?: string;
        imageUrl?: string | null;
        badges?: string[];
        specs?: Record<string, string>;
        pros?: string[];
        cons?: string[];
      }>;
    }
  | {
    kind: "filters";
    heading?: string;
    chips?: string[];
    ranges?: Array<{ label: string; min?: number; max?: number }>;
  }
  | {
      kind: "productGrid";
      title?: string;
      products: ProductCard[];
    }
  | {
      kind: "question";
      prompt: string;
      chips?: string[];
    };

// Full assistant response
export interface AssistantResponse {
  assistantMessage: string;
  ui: AssistantUIModel;
  products: ProductCard[];
  debug: {
    modelUsed: string;
    shopifyQuery: string;
    intentRaw?: SearchIntent;
    fallbackReason?: string;
    searchError?: string;
    knowledgeBaseStatus?: { initialized: boolean; productCount: number };
    externalTopics?: string[]; // Pass through for future web lookup integration
  };
}

// Possible next actions after parsing intent
export type NextAction = "ASK_FOLLOWUP" | "EDUCATE_THEN_SEARCH" | "SEARCH_NOW";

// Gemini structured output schema
export interface SearchIntent {
  query: string;
  first: number;
  sortKey: "RELEVANCE" | "BEST_SELLING" | "PRICE" | "CREATED_AT";
  reverse: boolean;
  uiTitle: string;
  assistantMessage: string;
  // New guided discovery fields
  confidence: number; // 0-1 confidence in being able to return good products
  nextAction: NextAction;
  followupQuestion?: string; // Question to ask user when confidence is low
  educationSummary?: string; // Educational blurb about the product category
  externalTopics?: string[]; // Topics to look up online for additional context
}

// Shopify product sort keys
export type ProductSortKey = "RELEVANCE" | "BEST_SELLING" | "PRICE" | "CREATED_AT" | "TITLE" | "PRODUCT_TYPE" | "VENDOR";

// Search params for Shopify
export interface ShopifySearchParams {
  query: string;
  first: number;
  sortKey: ProductSortKey;
  reverse: boolean;
}

// Request body for /api/assistant
export interface AssistantRequestBody {
  message: string;
  history?: ChatMessage[];
  conversationState?: RetailConversationState; // For retail agent
}

// Retail conversation state (legacy - for backwards compatibility)
export interface RetailConversationState {
  intent: string | null;
  primary_use: string | null;
  experience_level: string | null;
  budget_range: string | null;
  constraints_locked: boolean;
}

// New blocker-driven conversation state
export interface BlockerConversationState {
  // Primary use case - HIGHEST PRIORITY (~80% elimination)
  primaryUseCase: string | null;

  // Budget range - HIGH PRIORITY (~60% elimination)
  budget: { min?: number; max?: number } | null;

  // Skill level - MEDIUM PRIORITY (~40% elimination)
  skillLevel: "beginner" | "intermediate" | "pro" | "expert" | null;

  // Portability preference - LOW PRIORITY (~30% elimination)
  portabilityPreference: "portable" | "quality" | "balanced" | null;

  // Additional context from conversation
  additionalContext?: string;
}

// Blocker types that prevent confident recommendations
export enum BlockerType {
  MISSING_USE_CASE = "MISSING_USE_CASE",
  BUDGET_UNCLEAR = "BUDGET_UNCLEAR",
  SKILL_MISMATCH = "SKILL_MISMATCH",
  PORTABILITY_TRADEOFF = "PORTABILITY_TRADEOFF",
  AMBIGUITY_FROM_PRODUCT = "AMBIGUITY_FROM_PRODUCT",
}

// A blocker that prevents confident recommendation
export interface Blocker {
  type: BlockerType;
  priority: number; // 1 = highest priority
  reason: string; // Human-readable explanation
  source: "state" | "product"; // Where the blocker came from
  relatedProducts?: number[]; // Product IDs that triggered this blocker
  suggestedChips?: string[]; // Quick response options
}

// Retail product (from Supabase products_dummy - legacy)
export interface RetailProduct {
  id: string;
  name: string;
  category: string; // Product type from DB (e.g., "Mirrorless Camera", "Lens", etc.)
  description: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

// Enriched product from kb_enriched_variants + latest_product
export interface EnrichedProductType {
  productId: number;
  variantId: number;
  title: string;
  handle: string;
  price: number;
  imageUrl: string | null;
  // Enriched fields from Gemini
  useCases: string[];
  skillLevel: string | null;
  portabilityScore: number | null;
  priceTier: string | null;
  bestFor: string[];
  notBestFor: string[];
  tradeoffs: string[];
  ambiguityTriggers: string[];
  confidenceScore: number | null;
  // Search scoring
  matchScore: number;
  matchedFields: Record<string, { text: string; similarity: number }>;
}

// Product tradeoff info for display
export interface ProductTradeoff {
  productId: number;
  tradeoffs: string[];
}

// Retail agent response (legacy)
export interface RetailAgentResponse {
  assistantMessage: string;
  state: RetailConversationState;
  products?: RetailProduct[];
  ui: {
    type: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
    chips?: string[];
    comparison?: {
      productA: RetailProduct;
      productB: RetailProduct;
      tradeoffs: string[];
    };
    checkout?: {
      items: RetailProduct[];
      total: number;
    };
  };
  confidence: number; // 0-1 confidence score based on state completeness
}

// New blocker-driven agent response
export interface BlockerAgentResponse {
  assistantMessage: string;
  state: BlockerConversationState;
  products?: EnrichedProductType[];
  blockers: Blocker[];
  ui: {
    type: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
    chips?: string[];
    tradeoffs?: ProductTradeoff[]; // Shown when recommending products
    comparison?: {
      productA: EnrichedProductType;
      productB: EnrichedProductType;
      tradeoffs: string[];
    };
    checkout?: {
      items: EnrichedProductType[];
      total: number;
    };
  };
}

