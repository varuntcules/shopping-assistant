# Product Information Chunking Rules

This document defines how product information from Shopify is transformed into "chunks" for semantic retrieval and reasoning.

## Overview

Even if we don't use embeddings yet, we define a deterministic chunking strategy that allows us to:
1. Organize product information into logical units
2. Enable targeted retrieval based on use cases
3. Support weighted matching against user intent

## Chunk Types

### 1. Overview Chunk

**Purpose**: High-level product summary and basic identification

**Contains**:
- Product ID
- Title
- Vendor
- Product Type/Category
- Price (if available)
- Availability status
- Primary image URL

**Metadata**:
- `chunk_type`: "overview"
- `product_id`: string
- `category`: string
- `weight`: 1.0 (always included in retrieval)

**Use Case**: Initial product identification and filtering

---

### 2. Feature Group Chunks

**Purpose**: Detailed feature information organized by attribute groups

**Contains**: Extracted attributes from:
- `body_html` (product description)
- `tags` (product tags)
- Product specifications/metafields (if available)

**Attribute Groups** (examples):
- **Physical Attributes**: weight, dimensions, size, material
- **Image/Video Attributes**: resolution, sensor size, zoom, aperture
- **Performance Attributes**: battery life, low light performance, ISO range
- **Connectivity Attributes**: Wi-Fi, Bluetooth, USB ports
- **Usability Attributes**: ease of use, learning features, auto modes

**Metadata**:
- `chunk_type`: "feature_group"
- `product_id`: string
- `attribute_group`: string (e.g., "physical", "image_video", "performance")
- `weight`: 0.8 (important but secondary to overview)

**Use Case**: Matching specific attributes to user requirements

---

### 3. Use Case Fit Chunks

**Purpose**: Pre-computed or extracted fit scores for specific use cases

**Contains**:
- Use case identifiers: `travel_vlogging`, `beginner_photography`, `low_light_events`
- Fit scores: `high`, `medium`, `low`, `unknown`
- Supporting evidence: which attributes contribute to the fit

**Metadata**:
- `chunk_type`: "use_case_fit"
- `product_id`: string
- `use_case`: string
- `fit_score`: string
- `weight`: 1.2 (highly relevant when user intent matches)

**Use Case**: Direct matching when user specifies a purpose

---

## Chunking Process

### Step 1: Extract from Shopify Product

```typescript
interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  body_html?: string;
  tags?: string;
  variants: Array<{ price: string }>;
  images: Array<{ src: string }>;
}
```

### Step 2: Create Overview Chunk

```typescript
{
  chunk_type: "overview",
  product_id: "123",
  title: "Camera X",
  category: "Cameras",
  price: { value: 50000, currency: "INR" },
  availability: "in_stock",
  metadata: { chunk_type: "overview", weight: 1.0 }
}
```

### Step 3: Extract Feature Groups

Parse `body_html` and `tags` to extract attributes:
- Use keyword matching for known attributes
- Use controlled vocabulary from `purpose_attribute_map.json`
- Mark as "unknown" if attribute cannot be determined

### Step 4: Compute Use Case Fit

For each defined use case:
- Match extracted attributes against `top_attributes` from purpose map
- Apply `attribute_weights` to compute weighted score
- Convert to `high`/`medium`/`low`/`unknown`

---

## Retrieval Strategy (Simulated)

Since we're not using vector embeddings yet, we simulate retrieval using:

1. **Deterministic Filters**:
   - Category match
   - Price range (if specified)
   - Availability (prefer in_stock)

2. **Simple Keyword Match**:
   - Tokenize query and product text
   - Count overlapping tokens
   - Boost score for exact matches

3. **Weighted Attribute Matching**:
   - For each purpose, match attributes from `key_attributes` in intent
   - Apply weights from `purpose_attribute_map.json`
   - Sum weighted scores

4. **Final Ranking**:
   - Combine filter score + keyword score + attribute score
   - Sort by total score (descending)
   - Return top N products

---

## Required Metadata Per Chunk

All chunks must include:

```typescript
{
  chunk_type: "overview" | "feature_group" | "use_case_fit",
  product_id: string,
  source_fields: string[], // Which Shopify fields were used
  timestamp: string, // When chunk was created
  weight: number // Relevance weight for retrieval
}
```

---

## Example: Camera Product

**Input** (Shopify):
```json
{
  "id": 123,
  "title": "Sony Alpha A7 III",
  "product_type": "Camera",
  "body_html": "Full-frame mirrorless camera with 24MP sensor, 4K video, excellent low-light performance",
  "tags": "full-frame, mirrorless, 4K, low-light"
}
```

**Chunks Generated**:

1. **Overview**:
   - product_id: "123"
   - title: "Sony Alpha A7 III"
   - category: "Camera"
   - price: (from variants)

2. **Feature Group (Image/Video)**:
   - resolution: "4K"
   - sensor_size: "full_frame"
   - low_light_performance: "high"

3. **Use Case Fit**:
   - travel_vlogging: "medium" (heavy, but good quality)
   - beginner_photography: "low" (complex, not beginner-friendly)
   - low_light_events: "high" (excellent low-light performance)

---

## Notes

- If an attribute cannot be determined from available data, mark it as `"unknown"`
- Never invent or hallucinate attributes
- Always include `source_fields` to track which Shopify fields were used
- Chunks are created during product sync/enrichment, not at query time


