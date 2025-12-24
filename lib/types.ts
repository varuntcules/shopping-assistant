// Chat message types
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductCard[];
  ui?: AssistantUIModel;
  confidence?: number; // 0-1 confidence score (only for assistant messages)
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

// Retail conversation state
export interface RetailConversationState {
  intent: string | null;
  primary_use: string | null;
  experience_level: string | null;
  budget_range: string | null;
  constraints_locked: boolean;
}

// Retail product (from Supabase)
export interface RetailProduct {
  id: string;
  name: string;
  category: string; // Product type from DB (e.g., "Mirrorless Camera", "Lens", etc.)
  description: string;
  price: number;
  currency: string;
  imageUrl?: string;
}

// Retail agent response
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

