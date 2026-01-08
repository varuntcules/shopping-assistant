-- SQL script to create the kb_embeddings table in Supabase
-- Run this in your Supabase SQL editor

-- ============================================================================
-- STEP 1: Enable pgvector extension (REQUIRED)
-- ============================================================================
-- Supabase usually has this enabled by default, but run this first to be sure:
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- STEP 2: Create the kb_embeddings table
-- ============================================================================

-- Create the kb_embeddings table
CREATE TABLE IF NOT EXISTS public.kb_embeddings (
  id SERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  embedding_type TEXT NOT NULL, -- 'use_cases', 'best_for', 'not_best_for', 'tradeoffs', 'ambiguity_triggers'
  embedding_text TEXT NOT NULL, -- The original text that was embedded
  embedding vector(768), -- 768 dimensions for Gemini embedding-001
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_kb_embeddings_variant_id FOREIGN KEY (variant_id) 
    REFERENCES public.kb_enriched_variants(variant_id) 
    ON DELETE CASCADE
);

-- Create index on variant_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_variant_id 
ON public.kb_embeddings(variant_id);

-- Create index on product_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_product_id 
ON public.kb_embeddings(product_id);

-- Create index on embedding_type for filtering
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_embedding_type 
ON public.kb_embeddings(embedding_type);

-- Create vector index for semantic search (using pgvector extension)
-- Make sure pgvector extension is enabled in Supabase
-- Run this if pgvector is not enabled: CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_kb_embeddings_vector 
ON public.kb_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create composite index for faster queries
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_variant_type 
ON public.kb_embeddings(variant_id, embedding_type);

-- Create unique constraint to prevent duplicate embeddings for same variant + type + text
-- This allows multiple embeddings per variant per type (for arrays), but prevents exact duplicates
-- Drop the index if it exists (in case it was created as just an index)
DROP INDEX IF EXISTS public.idx_kb_embeddings_unique;

-- Create unique constraint (not just index) so ON CONFLICT can reference it
ALTER TABLE public.kb_embeddings
DROP CONSTRAINT IF EXISTS kb_embeddings_unique;

ALTER TABLE public.kb_embeddings
ADD CONSTRAINT kb_embeddings_unique 
UNIQUE (variant_id, embedding_type, embedding_text);

-- Add comments for documentation
COMMENT ON TABLE public.kb_embeddings IS 'Stores embeddings for semantic search on variant data. Each array item gets its own embedding row.';
COMMENT ON COLUMN public.kb_embeddings.embedding_type IS 'Type of embedding: use_cases, best_for, not_best_for, tradeoffs, or ambiguity_triggers';
COMMENT ON COLUMN public.kb_embeddings.embedding_text IS 'The original text that was embedded (individual array item)';
COMMENT ON COLUMN public.kb_embeddings.embedding IS 'Vector embedding for semantic search (768 dimensions for Gemini embedding-001)';

