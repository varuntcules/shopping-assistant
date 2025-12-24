# Reasoning Model Implementation Summary

## File Tree Created/Modified

```
shopping-assistant/
├── rag/
│   ├── schema.json                          # ProductSemanticProfile & AgentResponse schemas
│   ├── purpose_attribute_map.json           # 3 purposes with attributes & questions
│   ├── chunking_rules.md                    # Product chunking strategy
│   └── example_outputs/
│       ├── vague_purpose.json               # Example: vague user purpose
│       ├── clear_purpose_budget.json        # Example: clear purpose + budget
│       └── comparison_request.json          # Example: comparison request
│
└── src/
    ├── agent/
    │   ├── reasoning.ts                     # Main reasoning engine
    │   ├── baseline.ts                      # Baseline mode (plain LLM)
    │   └── config.ts                        # Mode configuration (MODE env var)
    │
    └── tests/
        ├── eval_questions.json              # 12 test questions
        └── run_eval.ts                     # Test harness
```

## Key Excerpts

### 1. schema.json

Defines the core data structures:

**ProductSemanticProfile**:
- `product_id`, `title`, `category`, `price`, `availability`
- `key_attributes`: Extracted attributes (can be strings, numbers, or "unknown")
- `use_case_fit`: Scores for travel_vlogging, beginner_photography, low_light_events
- `proof`: Source fields from Shopify used to extract attributes

**AgentResponse**:
- `mode`: "clarify" | "recommend" | "compare" | "fail"
- `intent`: UserIntent object
- `clarifying_question`: Optional question with options
- `recommendations`: Array of up to 3 recommendations
- `comparison`: Optional comparison between two products
- `errors`: Array of error messages

### 2. purpose_attribute_map.json

Defines 3 purposes with:

**travel_vlogging**:
- Top attributes: weight_grams, size_dimensions, image_stabilization, video_resolution, battery_life, low_light_performance, zoom_range, audio_quality
- Attribute weights (e.g., weight_grams: 0.2, video_resolution: 0.15)
- Recommended clarifying questions
- Controlled vocabulary for each attribute

**beginner_photography**:
- Top attributes: ease_of_use, auto_mode_quality, price, learning_features, image_quality, battery_life, durability, connectivity
- Similar structure with weights and questions

**low_light_events**:
- Top attributes: low_light_performance, sensor_size, aperture, iso_range, image_stabilization, battery_life, flash_capability, noise_performance
- Focus on low-light specific attributes

### 3. reasoning.ts

Implements all required functions:

- `parseUserIntent(messages)`: Extracts purpose, budget, category, comparison_request from chat
- `decideNextQuestion(intent)`: Returns clarifying question or null
- `fetchCatalogSubset(intent)`: Fetches products from Shopify with caching
- `normalizeProduct(product)`: Converts Shopify product to ProductSemanticProfile (extracts only what exists, marks unknown otherwise)
- `scoreProduct(intent, profile)`: Scores product against intent with reasons
- `recommend(intent, profiles)`: Returns top 2-3 recommendations with confidence
- `compare(productA, productB, intent)`: Structured comparison
- `reason(messages)`: Main orchestration function

### 4. baseline.ts

Simple baseline mode that:
- Fetches products from Shopify
- Prompts LLM with raw product JSON
- Returns plain text (no schema enforcement)

### 5. Test Harness

**eval_questions.json**: 12 questions covering:
- 4 vague queries requiring clarification
- 4 clear purpose + budget queries
- 4 comparison requests

**run_eval.ts**: Evaluates:
- JSON validity (semantic mode)
- Hallucination avoidance (checks for proof)
- Clarifying questions when needed
- Expected mode matching

## Example Outputs

### 1. Vague User Purpose

```json
{
  "mode": "clarify",
  "intent": {
    "purpose": null,
    "budget": null,
    "category": "Camera",
    "key_attributes": {},
    "comparison_request": null
  },
  "clarifying_question": {
    "text": "What will you primarily use this camera for?",
    "options": ["Travel vlogging", "Beginner photography", "Low light events", "Something else"]
  },
  "recommendations": [],
  "comparison": null,
  "errors": []
}
```

### 2. Clear Purpose + Budget

```json
{
  "mode": "recommend",
  "intent": {
    "purpose": "travel_vlogging",
    "budget": { "min": null, "max": 50000, "currency": "INR" },
    "category": "Camera",
    "key_attributes": {},
    "comparison_request": null
  },
  "clarifying_question": null,
  "recommendations": [
    {
      "product_id": "123",
      "title": "Sony ZV-1 Compact Camera",
      "price": { "value": 45000, "currency": "INR", "as_of": "2025-01-27T10:00:00Z" },
      "availability": "in_stock",
      "why_it_fits": [
        "Excellent fit for travel_vlogging",
        "Has video_resolution: 4K",
        "Has weight_grams: 294"
      ],
      "tradeoffs": ["No major tradeoffs identified"],
      "confidence": "high",
      "proof": ["body_html", "title"]
    }
  ],
  "comparison": null,
  "errors": []
}
```

### 3. Comparison Request

```json
{
  "mode": "compare",
  "intent": {
    "purpose": "travel_vlogging",
    "budget": null,
    "category": "Camera",
    "key_attributes": {},
    "comparison_request": ["123", "456"]
  },
  "clarifying_question": null,
  "recommendations": [],
  "comparison": {
    "product_a": { ... },
    "product_b": { ... },
    "differences": [
      "Product A is ₹3000 cheaper",
      "video_resolution: A has 4K, B has 4K"
    ],
    "best_for": {
      "a": ["Budget-conscious buyers", "travel_vlogging"],
      "b": ["General use"]
    }
  },
  "errors": []
}
```

## Usage

### Running in Semantic Mode (default):
```bash
MODE=semantic npm run dev
```

### Running in Baseline Mode:
```bash
MODE=baseline npm run dev
```

### Running Tests:
```bash
# Semantic mode
MODE=semantic tsx src/tests/run_eval.ts

# Baseline mode
MODE=baseline tsx src/tests/run_eval.ts
```

## Key Features

1. **Strict Schema Enforcement**: All outputs must match AgentResponse schema
2. **No Hallucinations**: Attributes marked "unknown" if not found; proof array tracks sources
3. **Focused Clarifying Questions**: Asks one question at a time based on missing intent
4. **Purpose-Based Matching**: Maps user purpose to 6-8 key attributes with weights
5. **Grounded Comparisons**: Only states differences that can be proven from product data
6. **A/B Testing Ready**: Baseline mode for comparison

## Constraints Followed

- ✅ Uses existing Shopify fetch logic
- ✅ Hackathon simple (no vector DB needed)
- ✅ In-memory caching for session
- ✅ No checkout functionality
- ✅ Controlled vocabulary (high/medium/low/unknown)
- ✅ Never invents product specs


