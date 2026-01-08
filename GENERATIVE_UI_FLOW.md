# Generative UI Decision Flow

This document illustrates how the agent decides when to show generative UI (questions), ask clarifying questions, or display products.

## High-Level Flow

```
User Message
    ↓
[Extract Info via Gemini]
    ├─ use_case
    ├─ product_type
    ├─ price_min/max
    └─ skill_level
    ↓
[Decision Tree in processMessage()]
```

## Decision Tree

### 1. Product Type Present?
```
IF product_type is set (e.g., "tripod", "light", "camera")
    ↓
    Search by product_type
    ↓
    IF products found:
        → UI: type="recommendation" + ProductGrid
    ELSE IF price filter exists:
        → Try without price filter
        → IF found: UI: type="recommendation" + "outside budget" message
        → ELSE: UI: type="recovery" + chips
    ELSE:
        → UI: type="recovery" + chips
```

### 2. Use Case Missing?
```
IF use_case is NULL/empty
    ↓
    → UI: type="question" 
    → Message: "What will you primarily use this camera for?"
    → Chips: ["Travel vlogging", "Studio photography", ...]
    → Mode: "education" (orange lightbulb icon)
```

### 3. Budget Missing?
```
IF use_case exists BUT (price_min AND price_max are NULL) AND user didn't say "no budget"
    ↓
    → UI: type="question"
    → Message: "Great! For {use_case}, what's your budget range?"
    → Chips: ["Under ₹25,000", "₹25,000 - 50,000", ...]
    → Mode: "education"
```

### 4. Search Products
```
IF use_case exists AND (price exists OR user said "no budget")
    ↓
    Search products with:
        - use_case (semantic search)
        - price_min/max (if provided)
        - skill_level (if provided)
    ↓
    IF products.length === 0:
        → Try without price filter (if price was set)
        → IF found: UI: type="recommendation" + "outside budget" message
        → ELSE: UI: type="recovery" + chips
    ELSE IF hasExactMatches === false:
        → UI: type="recommendation" + explanation about approximate matches
    ELSE:
        → UI: type="recommendation" + ProductGrid
        → Mode: "shopping" (purple lightning icon)
```

## UI Type Mapping

| `ui.type` | Visual Mode | Components Shown | When Used |
|-----------|-------------|------------------|-----------|
| `"question"` | `mode: "education"` | Message bubble + QuickChips | Missing use_case or budget |
| `"recommendation"` | `mode: "shopping"` | Message bubble + ProductGrid | Products found |
| `"recovery"` | `mode: "education"` | Message bubble + QuickChips | No products found, needs adjustment |

## State Persistence

The `collectedInfo` object is passed between turns:
- **First turn**: `{ use_case: null, product_type: null, price_min: null, price_max: null, skill_level: null }`
- **After use_case chip**: `{ use_case: "travel vlogging", ... }`
- **After budget chip**: `{ use_case: "travel vlogging", price_min: 100000, ... }`
- **After search**: Same state preserved for follow-ups

## Example Conversation Flow

```
User: "I need a camera for travel vlogging"
    ↓
[Extract: use_case="travel vlogging"]
    ↓
[Check: use_case exists ✓, price missing ✗]
    ↓
Response: 
    - UI type: "question"
    - Message: "Great! For travel vlogging, what's your budget range?"
    - Chips: ["Under ₹25,000", ...]
    - Mode: "education"

User clicks: "Above ₹1 Lakh"
    ↓
[Extract: price_max=100000 (from chip)]
    ↓
[Check: use_case ✓, price ✓]
    ↓
[Search products with use_case="travel vlogging", price_max=100000]
    ↓
Response:
    - UI type: "recommendation"
    - Message: "Here are some great options for travel vlogging:"
    - Products: [ProductGrid with 6 items]
    - Mode: "shopping"
```

## Special Cases

1. **"No budget limit"**: Clears price filters, skips budget question
2. **Product type specified**: Bypasses use_case flow, searches directly
3. **Approximate matches**: Shows products with explanation about similarity
4. **No results with price**: Tries without price, shows "outside budget" message


