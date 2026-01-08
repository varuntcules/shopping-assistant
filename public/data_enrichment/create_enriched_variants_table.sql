-- SQL script to create and optimize the kb_enriched_variants table in Supabase
-- Run this in your Supabase SQL editor

-- Create the table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.kb_enriched_variants (
  variant_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  use_cases TEXT[] NULL,
  skill_level TEXT NULL,
  portability_score INTEGER NULL,
  price_tier TEXT NULL,
  best_for TEXT[] NULL,
  not_best_for TEXT[] NULL,
  tradeoffs TEXT[] NULL,
  confidence_notes TEXT[] NULL,
  ambiguity_triggers TEXT[] NULL,
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT kb_enriched_variants_pkey PRIMARY KEY (variant_id)
) TABLESPACE pg_default;

-- Add foreign key constraint to link to latest_product table
-- This ensures data integrity between products and variants
ALTER TABLE public.kb_enriched_variants
DROP CONSTRAINT IF EXISTS fk_kb_enriched_variants_product_id;

ALTER TABLE public.kb_enriched_variants
ADD CONSTRAINT fk_kb_enriched_variants_product_id
FOREIGN KEY (product_id) REFERENCES public.latest_product(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Create index on product_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_product_id 
ON public.kb_enriched_variants(product_id);

-- Create index on skill_level for filtering
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_skill_level 
ON public.kb_enriched_variants(skill_level);

-- Create index on price_tier for filtering
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_price_tier 
ON public.kb_enriched_variants(price_tier);

-- Create index on updated_at for tracking recent updates
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_updated_at 
ON public.kb_enriched_variants(updated_at);

-- Create GIN index on use_cases array for array operations
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_use_cases 
ON public.kb_enriched_variants USING GIN (use_cases);

-- Create GIN index on best_for array for array operations
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_best_for 
ON public.kb_enriched_variants USING GIN (best_for);

