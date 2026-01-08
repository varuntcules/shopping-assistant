# Table Mapping: latest_product, kb_enriched_variants, and kb_embeddings

## Overview

This document describes the relationships and mappings between the three main tables in the shopping assistant database.

## Table Relationships

```
latest_product (id)
    ↓ (FK: product_id)
kb_enriched_variants (variant_id, product_id)
    ↓ (FK: variant_id)
kb_embeddings (id, variant_id, product_id)
```

## 1. latest_product

**Primary Key:** `id` (BIGINT)

**Purpose:** Stores raw product data synced from Shopify

**Key Fields:**
- `id` - Product ID (primary key, from Shopify)
- `title` - Product title
- `body_html` - Product description
- `vendor` - Product vendor
- `variants` - JSONB array containing variant data
  - Each variant has: `id`, `price`, `title`, `sku`, `inventory_quantity`, etc.
- `images` - JSONB array of product images
- `options` - JSONB array of product options
- `handle` - Product URL handle
- `tags` - Product tags
- `status` - Product status

**Note:** Variants are stored as JSONB within the product. The `variant_id` used in other tables comes from `variants->>'id'`.

## 2. kb_enriched_variants

**Primary Key:** `variant_id` (BIGINT)

**Purpose:** Stores AI-enriched metadata for individual product variants

**Key Fields:**
- `variant_id` - Variant ID (primary key, extracted from `latest_product.variants`)
- `product_id` - Product ID (foreign key to `latest_product.id`)
- `use_cases` - TEXT[] - Array of use cases (e.g., ["studio_photography", "portrait_photography"])
- `skill_level` - TEXT - "beginner", "intermediate", "advanced", or "professional"
- `price_tier` - TEXT - "budget", "mid-range", "premium", or "luxury"
- `portability_score` - INTEGER - Portability rating
- `best_for` - TEXT[] - Array of best use scenarios
- `not_best_for` - TEXT[] - Array of scenarios where not ideal
- `tradeoffs` - TEXT[] - Array of tradeoff descriptions
- `ambiguity_triggers` - TEXT[] - Array of ambiguous scenarios
- `confidence_notes` - TEXT[] - Array of confidence-related notes
- `confidence_score` - INTEGER (0-100) - Confidence level for enrichment data
- `updated_at` - TIMESTAMP - Last update time

**Foreign Key:**
- `product_id` → `latest_product.id` (ON DELETE CASCADE, ON UPDATE CASCADE)

**Relationship:**
- One product (`latest_product`) can have multiple variants (`kb_enriched_variants`)
- Each variant in `latest_product.variants` (JSONB) should have a corresponding row in `kb_enriched_variants` with matching `variant_id`

## 3. kb_embeddings

**Primary Key:** `id` (SERIAL)

**Purpose:** Stores vector embeddings for semantic search on enriched variant data

**Key Fields:**
- `id` - Auto-incrementing primary key
- `variant_id` - Variant ID (foreign key to `kb_enriched_variants.variant_id`)
- `product_id` - Product ID (denormalized for performance, not a FK)
- `embedding_type` - TEXT - Type of embedding:
  - `'use_cases'`
  - `'best_for'`
  - `'not_best_for'`
  - `'tradeoffs'`
  - `'ambiguity_triggers'`
- `embedding_text` - TEXT - The original text that was embedded (individual array item)
- `embedding` - vector(768) - Vector embedding for semantic search (Gemini embedding-001)
- `created_at` - TIMESTAMP - Creation time
- `updated_at` - TIMESTAMP - Update time

**Foreign Key:**
- `variant_id` → `kb_enriched_variants.variant_id` (ON DELETE CASCADE)

**Unique Constraint:**
- `(variant_id, embedding_type, embedding_text)` - Prevents duplicate embeddings

**Relationship:**
- One variant (`kb_enriched_variants`) can have multiple embeddings (`kb_embeddings`)
- Each array item in `kb_enriched_variants` fields (use_cases, best_for, etc.) gets its own embedding row
- For example, if a variant has `use_cases = ['studio_photography', 'portrait_photography']`, there will be 2 rows in `kb_embeddings` with `embedding_type = 'use_cases'`

## Mapping Summary

### Key Join Fields

| From Table | Field | To Table | Field | Relationship |
|------------|-------|----------|-------|--------------|
| `latest_product` | `id` | `kb_enriched_variants` | `product_id` | One-to-Many |
| `kb_enriched_variants` | `variant_id` | `kb_embeddings` | `variant_id` | One-to-Many |
| `kb_enriched_variants` | `variant_id` | `latest_product.variants` | `variants->>'id'` | Extracted from JSONB |

### Typical Query Pattern

```sql
SELECT 
  lp.id as product_id,
  lp.title,
  lp.variants as variants_json,
  lp.images as images_json,
  kev.variant_id,
  kev.use_cases,
  kev.skill_level,
  kev.price_tier,
  ke.embedding_type,
  ke.embedding_text,
  ke.embedding
FROM latest_product lp
LEFT JOIN kb_enriched_variants kev ON lp.id = kev.product_id
LEFT JOIN kb_embeddings ke ON kev.variant_id = ke.variant_id
WHERE lp.id = ?
```

### Data Flow

1. **Product Sync:** Products are synced from Shopify → `latest_product` table
2. **Variant Extraction:** Variants are extracted from `latest_product.variants` (JSONB)
3. **Enrichment:** Each variant is enriched with AI-generated metadata → `kb_enriched_variants`
4. **Embedding Generation:** Array fields from `kb_enriched_variants` are embedded → `kb_embeddings`

### Important Notes

- `variant_id` in `kb_enriched_variants` comes from the `id` field within the `variants` JSONB array in `latest_product`
- `kb_embeddings.product_id` is denormalized (not a foreign key) for query performance
- When a product is deleted from `latest_product`, related rows in `kb_enriched_variants` are cascade deleted
- When a variant is deleted from `kb_enriched_variants`, related rows in `kb_embeddings` are cascade deleted
- Multiple embeddings can exist per variant (one per array item per embedding_type)

