ROLE: You are a senior full-stack engineer.

GOAL: Build a bare-bones voice shopping assistant MVP using Next.js (App Router) + TypeScript + Tailwind.
User can speak (voice-to-text) or type. The server uses Gemini to convert natural language into structured
Shopify Storefront search params, fetches products, and returns UI-ready JSON to render product cards.

ABSOLUTE CONSTRAINTS
- Next.js App Router + TypeScript + Tailwind only. No Python. No random HTML-only project.
- Secrets MUST stay server-side. Never call Shopify or Gemini from the browser.
- Voice-to-text: Web Speech API on the client. On stop, it fills the textarea (does not auto-send).
- Must be resilient: the app should NEVER crash because Gemini errors.
  If Gemini fails/rate-limits/invalid JSON: fall back to a basic Shopify search using the raw user message.
- Must use Gemini structured outputs (JSON schema) to avoid parsing failures.

TECH STACK
- Next.js (App Router) + TS + Tailwind
- Gemini via @google/genai (GoogleGenAI, responseMimeType + responseSchema)
- Shopify Storefront API via fetch (GraphQL)

ENV VARS (use .env.local; do not hardcode)
- SHOPIFY_STORE_DOMAIN="yourshop.myshopify.com"
- SHOPIFY_STOREFRONT_TOKEN="your_storefront_token"
- SHOPIFY_STOREFRONT_API_VERSION="2025-07"   (default in code if missing)
- GEMINI_API_KEY="your_ai_studio_key"
- GEMINI_MODEL="gemini-2.5-flash"            (default)
- GEMINI_MODEL_FALLBACK="gemini-2.5-flash-lite" (default)
- GEMINI_MODEL_EXPERIMENTAL=""               (optional; if set to "gemini-3-flash-preview", try it first)

PROJECT SETUP
- Use create-next-app with Tailwind + TS + ESLint.
- Install @google/genai.
- Use Node.js runtime for route handlers (NOT Edge) to avoid SDK issues.

REQUIRED FILE STRUCTURE (must match)
- app/page.tsx
- app/api/assistant/route.ts
- lib/types.ts
- lib/shopify.ts
- lib/gemini.ts
- components/Chat.tsx
- components/VoiceInput.tsx
- components/ProductGrid.tsx
- README.md

UI REQUIREMENTS (app/page.tsx)
- Layout:
  - Header: “Voice Shopping Assistant”
  - Chat transcript (scrollable)
  - Input area: mic button + textarea + Send button
  - Product grid under the latest assistant message
- Chat shows user and assistant bubbles.
- VoiceInput:
  - Uses window.SpeechRecognition / webkitSpeechRecognition
  - Start/Stop toggle
  - interimResults optional
  - When stopped, send final transcript to parent to populate textarea
  - If SpeechRecognition unsupported, show a small note “Voice not supported in this browser.”

API CONTRACTS
Client -> Server POST /api/assistant
{
  "message": string,
  "history"?: Array<{ "role": "user" | "assistant", "content": string }>
}

Server -> Client
{
  "assistantMessage": string,
  "ui": { "layout": "grid", "title": string },
  "products": Array<{
    "id": string,
    "title": string,
    "handle": string,
    "vendor": string,
    "productType": string,
    "price": { "amount": string, "currencyCode": string },
    "image": { "url": string, "altText": string | null },
    "url": string
  }>,
  "debug": {
    "modelUsed": string,
    "shopifyQuery": string,
    "intentRaw"?: any,
    "fallbackReason"?: string
  }
}

TYPES (lib/types.ts)
- ChatMessage
- ProductCard
- AssistantUIModel
- AssistantResponse
- SearchIntent (Gemini output)

SHOPIFY (lib/shopify.ts)
- Implement a small Storefront client:
  - endpoint: https://${SHOPIFY_STORE_DOMAIN}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json
  - header: X-Shopify-Storefront-Access-Token
- Implement:
  async function searchProducts(params: { query: string; first: number; sortKey: ProductSortKey; reverse: boolean }): Promise<ProductCard[]>
- Use GraphQL query `products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) { edges { node { ... } } }`
- Fetch only what we need for cards:
  - id, title, handle, vendor, productType
  - featuredImage { url altText }
  - priceRange { minVariantPrice { amount currencyCode } }
- Map to ProductCard including url: `https://${SHOPIFY_STORE_DOMAIN}/products/${handle}`

GEMINI (lib/gemini.ts)
- Use @google/genai:
  import { GoogleGenAI, Type } from "@google/genai";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

- Must use structured outputs:
  config: {
    responseMimeType: "application/json",
    responseSchema: <schema>,
    temperature: 0.2
  }

Gemini MUST output exactly this JSON object (SearchIntent):
{
  "query": string,          // Shopify search syntax. If user is vague, just keywords.
  "first": number,          // default 12 (clamp 4..24)
  "sortKey": "RELEVANCE" | "BEST_SELLING" | "PRICE" | "CREATED_AT",
  "reverse": boolean,
  "uiTitle": string,
  "assistantMessage": string
}

Rules the model must follow:
- Output must be valid JSON only. No markdown.
- If budget in INR like "under 5k" => treat as 5000. If "under 10,000" => 10000.
- If user says “cheap” with no number => set sortKey PRICE and reverse false (ascending).
- If user gives “latest/newest” => sortKey CREATED_AT and reverse true.
- If user says “best selling/popular” => sortKey BEST_SELLING and reverse false.
- Use `vendor:` only if confident. Otherwise keep brand as a keyword term.
- Keep query short and robust:
  - Prefer filters supported by Shopify query: title:, tag:, vendor:, product_type:, variants.price:
  - Combine with OR only when user explicitly gives alternatives.

MODEL SELECTION + NO-ERROR GUARANTEE
In /api/assistant route:
- Build a model try-list:
  1) if GEMINI_MODEL_EXPERIMENTAL is set (e.g. "gemini-3-flash-preview"), try it first
  2) GEMINI_MODEL (default "gemini-2.5-flash")
  3) GEMINI_MODEL_FALLBACK (default "gemini-2.5-flash-lite")
- Call Gemini with structured output. If it errors (rate limit, invalid response, etc.), try next model.
- If all models fail: fall back to intent = {
    query: message (trim),
    first: 12,
    sortKey: "RELEVANCE",
    reverse: false,
    uiTitle: "Results",
    assistantMessage: "Showing results for: <message>"
  }
- In all cases, still call Shopify and return products if possible.
- The API must return JSON with HTTP 200 unless Shopify also fails.
- If Shopify fails too, return products: [] and a helpful assistantMessage.

CACHING
- Implement a simple in-memory cache in route.ts or lib/shopify.ts:
  key = `${query}|${first}|${sortKey}|${reverse}`
  TTL ~ 60 seconds is enough.
- Also cache Gemini intent by message for ~60 seconds to reduce calls during iteration.

SECURITY
- Never log or return API keys/tokens.
- debug.shopifyQuery is okay.
- debug.intentRaw is okay (but do not include secrets).

README.md
Include:
- Setup steps
- .env.local example (with placeholders)
- Run instructions (npm install, npm run dev)
- Notes: Voice works in Chromium browsers; fallback to typing otherwise.

OUTPUT REQUIREMENT
Generate the full code for every required file with complete contents. No TODOs for core logic.
The app must run with `npm run dev`.

END.
