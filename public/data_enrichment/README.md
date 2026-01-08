# Product Enrichment Service

This service fetches products from Shopify, stores them in Supabase, and enriches variant data using Google's Gemini AI model.

## Project Structure

```
.
├── config.json                          # Configuration file (API keys, settings, prompt template)
├── get_product.py                       # Fetch products from Shopify
├── upload_to_supabase.py                # Upload products to Supabase
├── enrich_variants.py                   # Main enrichment script (processes all products)
├── test_enrichment.py                   # Test script (processes configured number of products)
├── create_table.sql                     # SQL to create latest_product table
├── create_enriched_variants_table.sql   # SQL to create kb_enriched_variants table
├── requirements.txt                     # Python dependencies
└── product.json                         # Product data (generated)
```

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Settings

Edit `config.json` to set:
- Database URL
- Gemini API key (or set `GEMINI_API_KEY` environment variable)
- Number of products to process in test mode
- Processing settings

### 3. Create Database Tables

Run these SQL scripts in your Supabase SQL Editor:
1. `create_table.sql` - Creates `latest_product` table
2. `create_enriched_variants_table.sql` - Creates `kb_enriched_variants` table

## Usage

### Step 1: Fetch Products from Shopify

```bash
python get_product.py
```

This creates `product.json` with all products from your Shopify store.

### Step 2: Upload Products to Supabase

```bash
python upload_to_supabase.py
```

Uploads all products from `product.json` to the `latest_product` table.

### Step 3: Test Enrichment (Recommended First)

```bash
python test_enrichment.py
```

This processes the number of products specified in `config.json` (default: 3). It will:
- Verify which variants are already processed
- Skip processed variants (if configured)
- Show detailed output for verification

**Before running**, edit `config.json`:
```json
{
  "processing": {
    "products_to_process": 3,  // Change this number
    "skip_processed_variants": true
  }
}
```

### Step 4: Full Enrichment Processing

```bash
python enrich_variants.py
```

Processes all products. You can modify `config.json` to control:
- Batch size
- Whether to skip already processed variants
- API delays

## Configuration (config.json)

```json
{
  "database": {
    "url": "your-database-url"
  },
  "gemini": {
    "api_key": "your-api-key",
    "model": "gemini-2.5-flash-preview-09-2025",
    "max_retries": 3,
    "delay_between_calls": 0.5
  },
  "processing": {
    "products_to_process": 3,
    "batch_size": 10,
    "skip_processed_variants": true
  },
  "prompt_template": "..."
}
```

## Features

- **Configurable**: All settings in `config.json`
- **Prompt Management**: Prompt template stored in config file
- **Smart Processing**: Automatically skips already processed variants
- **Verification**: Shows which variants are processed before starting
- **Batch Processing**: Processes products in configurable batches
- **Error Handling**: Retries API calls, continues on errors
- **Progress Tracking**: Shows detailed progress and statistics

## Verification

When you run the enrichment scripts, they automatically verify:
- Which variants are already processed
- How many variants need processing per product
- Final summary of processed/skipped/error counts

## Query Examples

```sql
-- Check enriched variants
SELECT * FROM kb_enriched_variants;

-- Find variants by skill level
SELECT * FROM kb_enriched_variants WHERE skill_level = 'beginner';

-- Search by use case
SELECT * FROM kb_enriched_variants WHERE 'studio_photography' = ANY(use_cases);
```

