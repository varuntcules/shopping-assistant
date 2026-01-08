# Semantic Search with Embeddings

This module provides semantic search functionality for product variants using vector embeddings.

## Overview

The system generates embeddings from enriched variant data and stores them in the `kb_embeddings` table. It then provides a semantic search API that prioritizes results based on field importance:
1. **Priority 1**: `use_cases` matches
2. **Priority 2**: `best_for` matches  
3. **Priority 3**: Other fields (`not_best_for`, `tradeoffs`, `ambiguity_triggers`)

## Setup

### 1. Enable pgvector Extension in Supabase

Before creating the table, ensure the `vector` extension is enabled:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Create the Embeddings Table

Run the SQL script in Supabase SQL Editor:

```bash
# Run create_embeddings_table.sql in Supabase
```

This creates:
- `kb_embeddings` table with vector column
- Indexes for fast search
- Foreign key to `kb_enriched_variants`

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

**Note:** Uses **Google Gemini Embedding Model** (models/embedding-001)
- 768 dimensions
- Uses the same API key as the enrichment service
- Configured in `config.json`

### 4. Generate Embeddings

Generate embeddings for all variants:

```bash
# Generate for all variants
python generate_embeddings.py

# Generate for first 10 variants only
python generate_embeddings.py --limit 10

# Skip variants that already have embeddings
python generate_embeddings.py --skip-existing
```

This will:
- Read variants from `kb_enriched_variants` table
- Generate embeddings for: `use_cases`, `best_for`, `not_best_for`, `tradeoffs`, `ambiguity_triggers`
- Store embeddings in `kb_embeddings` table

### 5. Start Search API

Start the semantic search service:

```bash
python semantic_search.py
```

The API will run on `http://localhost:5000`

## Usage

### API Endpoints

#### Search
```bash
POST /search
Content-Type: application/json

{
  "query": "studio photography equipment for professionals",
  "limit": 10,
  "min_score": 0.7
}
```

**Response:**
```json
{
  "query": "studio photography equipment for professionals",
  "count": 5,
  "results": [
    {
      "variant_id": 12345,
      "product_id": 67890,
      "product_title": "Professional Flash Light",
      "skill_level": "pro",
      "price_tier": "mid",
      "similarity_score": 0.89,
      "priority": 1,
      "embedding_type": "use_cases",
      "embedding_text": "studio_photography professional_lighting",
      ...
    }
  ]
}
```

#### Health Check
```bash
GET /health
```

### Test Frontend

Open `test_search.html` in your browser to test the search functionality.

**Note:** Make sure the API is running and update the `API_URL` in the HTML file if needed.

## How It Works

### Embedding Generation

For each variant, the system:
1. Combines array fields into text strings
2. Generates embeddings using OpenAI or sentence-transformers
3. Stores embeddings with metadata (type, original text)

### Semantic Search

The search process:
1. Converts query text to embedding
2. Searches embeddings by priority:
   - First: `use_cases` (most relevant)
   - Second: `best_for` 
   - Third: Other fields
3. Calculates cosine similarity scores
4. Returns top matches with full variant details

### Priority System

Results are ranked by:
1. **Priority level** (1 > 2 > 3)
2. **Similarity score** (higher is better)

This ensures use case matches appear first, even if they have slightly lower similarity scores than other fields.

## Database Schema

### kb_embeddings Table

```sql
- id: SERIAL PRIMARY KEY
- variant_id: BIGINT (FK to kb_enriched_variants)
- product_id: BIGINT
- embedding_type: TEXT (use_cases, best_for, etc.)
- embedding_text: TEXT (original text)
- embedding: VECTOR(768) (vector embedding - Gemini embedding-001)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

## Performance Tips

1. **Indexes**: The table includes vector indexes for fast search
2. **Batch Processing**: Generate embeddings in batches
3. **Caching**: Consider caching popular queries
4. **Gemini Embeddings**: Uses Google's embedding-001 model (768 dimensions)

## Troubleshooting

### pgvector not available
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Embedding generation fails
- Check Gemini API key is set in config.json
- Verify database connection
- Check variant data exists
- Ensure pgvector extension is enabled

### Search returns no results
- Verify embeddings exist: `SELECT COUNT(*) FROM kb_embeddings;`
- Lower `min_score` threshold
- Check query is meaningful (not too short/long)

## Example Queries

```bash
# Find products for beginners
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "easy to use camera for beginners", "limit": 5}'

# Find professional equipment
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "professional studio lighting equipment", "limit": 10}'

# Find travel-friendly products
curl -X POST http://localhost:5000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "portable lightweight camera gear", "limit": 5}'
```

