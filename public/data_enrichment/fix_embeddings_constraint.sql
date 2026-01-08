-- SQL script to fix the unique constraint for kb_embeddings table
-- Run this in your Supabase SQL editor if you're getting ON CONFLICT errors

-- Drop the index if it exists (in case it was created as just an index)
DROP INDEX IF EXISTS public.idx_kb_embeddings_unique;

-- Drop existing constraint if it exists (in case it was created differently)
ALTER TABLE public.kb_embeddings
DROP CONSTRAINT IF EXISTS kb_embeddings_unique;

-- Create unique constraint (not just index) so ON CONFLICT can reference it
ALTER TABLE public.kb_embeddings
ADD CONSTRAINT kb_embeddings_unique 
UNIQUE (variant_id, embedding_type, embedding_text);

-- Verify the constraint was created
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'public.kb_embeddings'::regclass
AND conname = 'kb_embeddings_unique';

