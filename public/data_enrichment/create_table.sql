-- SQL script to create the latest_product table in Supabase
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS latest_product (
    id BIGINT PRIMARY KEY,
    title TEXT,
    body_html TEXT,
    vendor TEXT,
    product_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    handle TEXT,
    updated_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    template_suffix TEXT,
    published_scope TEXT,
    tags TEXT,
    status TEXT,
    admin_graphql_api_id TEXT,
    variants JSONB,
    options JSONB,
    images JSONB,
    created_at_db TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on handle for faster lookups
CREATE INDEX IF NOT EXISTS idx_latest_product_handle ON latest_product(handle);

-- Create index on vendor for filtering
CREATE INDEX IF NOT EXISTS idx_latest_product_vendor ON latest_product(vendor);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_latest_product_status ON latest_product(status);

-- Create GIN index on variants for JSONB queries
CREATE INDEX IF NOT EXISTS idx_latest_product_variants ON latest_product USING GIN (variants);

-- Create GIN index on options for JSONB queries
CREATE INDEX IF NOT EXISTS idx_latest_product_options ON latest_product USING GIN (options);

-- Create GIN index on images for JSONB queries
CREATE INDEX IF NOT EXISTS idx_latest_product_images ON latest_product USING GIN (images);

