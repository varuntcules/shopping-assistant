You are implementing the hackathon shopping assistant described in the brief.

Goal: Implement a STRICT "Semantic IA" reasoning layer + response contract so the assistant:
- asks focused clarifying questions (MAXIMUM 2 per conversation)
- maps user purpose -> key attributes (6–8)
- fetches products from the dummy product catalog
- recommends 2–3 products with explanations tied only to known attributes
- supports A vs B comparison
- handles uncertainty and avoids hallucinations

IMPORTANT CONSTRAINTS:
- Ask a MAXIMUM of 2 clarifying questions per conversation, then show products
- After 2 questions, proceed with best-guess recommendations using EDUCATE_THEN_SEARCH mode
- Do NOT change the schema without updating schema.json
- Do NOT invent product specs - if a required attribute is missing, mark it "unknown"
- All product recommendations come exclusively from the dummy catalog (products_dummy table)

=== Deliverables to implement in this repo ===

1) Create /rag/schema.json
- Define ProductSemanticProfile and AgentResponse formats.
- Include: product_id, title, category, price, availability, key_attributes, use_case_fit, proof (source fields).

2) Create /rag/purpose_attribute_map.json
- Define 3 purposes: travel_vlogging, beginner_photography, low_light_events
- For each: top_attributes (6–8), attribute_weights, and recommended clarifying questions.
- Use controlled vocab (high/medium/low/unknown etc.)

3) Create /rag/chunking_rules.md
- Even if we don’t use embeddings yet, define how product info becomes “chunks”:
  overview, feature_group, use_case_fit.
- Include required metadata per chunk.
- We will simulate retrieval using deterministic filters + simple keyword match + weights.

4) Implement a “Reasoning Engine”
Create /src/agent/reasoning.ts (or .js)
Functions:
- parseUserIntent(messages) -> UserIntent object
- decideNextQuestion(UserIntent) -> { type: "ask_clarifier", question, options[] } OR null
- fetchCatalogSubset(intent) -> fetch products from Shopify; filter by category + budget if present
- normalizeProduct(product) -> ProductSemanticProfile (extract only what exists; unknown otherwise; include proof)
- scoreProduct(intent, profile) -> numeric score + reasons[]
- recommend(intent, profiles) -> top 2–3 + confidence + tradeoffs
- compare(productA, productB, intent) -> structured comparison

5) Response Contract (must be enforced)
All assistant outputs must be valid JSON matching AgentResponse:
{
  "mode": "clarify" | "recommend" | "compare" | "fail",
  "intent": { ...UserIntent },
  "clarifying_question": { "text": "", "options": [] } | null,
  "recommendations": [
    {
      "product_id": "",
      "title": "",
      "price": { "value": 0, "currency": "INR", "as_of": "" } | null,
      "availability": "in_stock|out_of_stock|unknown",
      "why_it_fits": ["bullets tied to attributes ONLY"],
      "tradeoffs": ["bullets; unknown allowed"],
      "confidence": "high|medium|low",
      "proof": ["which Shopify fields were used"]
    }
  ],
  "comparison": {
    "product_a": { ... },
    "product_b": { ... },
    "differences": ["only grounded differences"],
    "best_for": { "a": ["use cases"], "b": ["use cases"] }
  } | null,
  "errors": []
}

6) Baseline mode for A/B testing
Add /src/agent/baseline.ts which:
- simply prompts the LLM to recommend products from raw Shopify JSON without the schema rules.
- returns plain text.
Then add a flag in config: MODE=baseline|semantic

7) Provide a test harness
Create /src/tests/eval_questions.json with at least 12 questions:
- 4 require clarifying questions
- 4 recommendations
- 4 comparisons
Create /src/tests/run_eval.ts to run both baseline and semantic and print:
- Whether JSON is valid (semantic mode)
- Whether it avoided hallucinations (check proof exists for claimed attributes)
- Whether it asked clarifiers when intent missing budget/purpose detail

=== Constraints ===
- Use existing Shopify fetch logic if present; otherwise implement a simple fetch using the Admin API described in the brief.
- Keep it hackathon simple. No need for vector DB. No checkout.
- Do not overfetch the entire catalog every message; cache in memory for the session.

=== Output ===
After implementation:
- show me the file tree you created/modified
- show key excerpts for schema.json and purpose_attribute_map.json
- show an example output JSON for:
  (1) vague user purpose
  (2) clear purpose + budget
  (3) comparison request
