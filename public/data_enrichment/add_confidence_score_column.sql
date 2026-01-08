-- SQL script to add confidence_score column to kb_enriched_variants table
-- Run this in your Supabase SQL editor

-- Add confidence_score column (INTEGER, range 0-100)
ALTER TABLE public.kb_enriched_variants
ADD COLUMN IF NOT EXISTS confidence_score INTEGER NULL;

-- Add a check constraint to ensure confidence_score is between 0 and 100
ALTER TABLE public.kb_enriched_variants
DROP CONSTRAINT IF EXISTS check_confidence_score_range;

ALTER TABLE public.kb_enriched_variants
ADD CONSTRAINT check_confidence_score_range
CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

-- Create index on confidence_score for faster filtering
CREATE INDEX IF NOT EXISTS idx_kb_enriched_variants_confidence_score 
ON public.kb_enriched_variants(confidence_score);

-- Optional: Add a comment to the column for documentation
COMMENT ON COLUMN public.kb_enriched_variants.confidence_score IS 'Confidence level for the enrichment data (0-100), where 0 is very low confidence and 100 is very high confidence';

