import json
import os
import re
import psycopg2
from psycopg2.extras import execute_values
import google.generativeai as genai
import time
import sys
from typing import List, Dict, Optional
from datetime import datetime
import numpy as np

# Load configuration
def load_config():
    """Load configuration from config.json"""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        return config
    except FileNotFoundError:
        print(f"Error: config.json not found at {config_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in config.json: {e}")
        sys.exit(1)

# Load config
CONFIG = load_config()

# Extract configuration
DATABASE_URL = CONFIG['database']['url']

# Gemini Configuration (for embeddings)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", CONFIG['gemini']['api_key'])
EMBEDDING_MODEL = CONFIG['gemini'].get('embedding_model', 'models/embedding-001')
EMBEDDING_DIMENSIONS = CONFIG['gemini'].get('embedding_dimensions', 768)

# Configure Gemini
if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
    print("Error: GEMINI_API_KEY not set. Please set it in config.json or as environment variable.")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
print(f"Using Gemini embedding model: {EMBEDDING_MODEL} ({EMBEDDING_DIMENSIONS} dimensions)")

def format_embedding_for_db(embedding: List[float]) -> str:
    """Convert embedding list to PostgreSQL vector format"""
    if not embedding:
        return None
    # Format: [0.1,0.2,0.3,...] for pgvector
    return '[' + ','.join(str(float(x)) for x in embedding) + ']'

def replace_underscores_with_spaces(value: str) -> str:
    """
    Replace underscores with spaces in a value.
    Example: "studio_lighting_setups" -> "studio lighting setups"
    Example: "on_location_equipment_mounting" -> "on location equipment mounting"
    """
    if not value or not value.strip():
        return ""
    
    # Replace underscores with spaces
    result = value.replace('_', ' ')
    
    # Normalize multiple spaces to single space
    result = re.sub(r'\s+', ' ', result)
    
    return result.strip()

def get_embedding(text: str) -> Optional[List[float]]:
    """Generate embedding for text using Gemini"""
    if not text or not text.strip():
        return None
    
    # Clean up the text (normalize whitespace)
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)
    
    if not text:
        return None
    
    try:
        # Use Gemini embedding model
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=text,
            task_type="RETRIEVAL_DOCUMENT"  # Use RETRIEVAL_QUERY for queries
        )
        embedding = result['embedding']
        # Validate embedding dimensions
        if embedding and len(embedding) == EMBEDDING_DIMENSIONS:
            return embedding
        else:
            print(f"  ⚠ Warning: Embedding has {len(embedding) if embedding else 0} dimensions, expected {EMBEDDING_DIMENSIONS}")
            return embedding  # Return anyway, might still work
    except Exception as e:
        print(f"  ✗ Error generating embedding for '{text[:50]}...': {e}")
        import traceback
        traceback.print_exc()
        return None

def process_items_for_embedding(items: List[str]) -> List[str]:
    """
    Process array items: replace underscores with spaces in each item.
    Each item becomes one embedding (phrases are kept together).
    
    Example:
    Input: ["studio_lighting_setups", "on_location_equipment_mounting"]
    Output: ["studio lighting setups", "on location equipment mounting"]
    
    Also handles comma-separated values:
    Input: ["studio_lighting,outdoor_shooting"]
    Output: ["studio lighting", "outdoor shooting"]
    """
    processed_items = []
    
    for item in items:
        if not item or not item.strip():
            continue
        
        # First, split by comma if there are multiple items in one string
        comma_split = [part.strip() for part in item.split(',') if part.strip()]
        
        # Then process each part: replace underscores with spaces
        for part in comma_split:
            processed = replace_underscores_with_spaces(part)
            if processed:
                processed_items.append(processed)
    
    return processed_items

def generate_embeddings_for_variant(conn, cursor, variant_id: int, product_id: int, 
                                   use_cases: List[str], best_for: List[str], 
                                   not_best_for: List[str], tradeoffs: List[str],
                                   ambiguity_triggers: List[str], skip_existing: bool = False):
    """Generate and store embeddings for a single variant - creates one embedding per phrase"""
    
    # Create list of (embedding_type, embedding_text) tuples - one embedding per phrase
    embeddings_to_create = []
    
    # Process use_cases - replace underscores with spaces, create one embedding per phrase
    if use_cases:
        phrases = process_items_for_embedding(use_cases)
        for phrase in phrases:
            embeddings_to_create.append(('use_cases', phrase))
    
    # Process best_for - replace underscores with spaces, create one embedding per phrase
    if best_for:
        phrases = process_items_for_embedding(best_for)
        for phrase in phrases:
            embeddings_to_create.append(('best_for', phrase))
    
    # Process not_best_for - replace underscores with spaces, create one embedding per phrase
    if not_best_for:
        phrases = process_items_for_embedding(not_best_for)
        for phrase in phrases:
            embeddings_to_create.append(('not_best_for', phrase))
    
    # Process tradeoffs - replace underscores with spaces, create one embedding per phrase
    if tradeoffs:
        phrases = process_items_for_embedding(tradeoffs)
        for phrase in phrases:
            embeddings_to_create.append(('tradeoffs', phrase))
    
    # Process ambiguity_triggers - replace underscores with spaces, create one embedding per phrase
    if ambiguity_triggers:
        phrases = process_items_for_embedding(ambiguity_triggers)
        for phrase in phrases:
            embeddings_to_create.append(('ambiguity_triggers', phrase))
    
    created_count = 0
    updated_count = 0
    skipped_count = 0
    
    for embedding_type, embedding_text in embeddings_to_create:
        try:
            # Check if embedding already exists (exact match on variant_id, type, and text)
            cursor.execute("""
                SELECT id FROM public.kb_embeddings 
                WHERE variant_id = %s AND embedding_type = %s AND embedding_text = %s
            """, (variant_id, embedding_type, embedding_text))
            
            existing = cursor.fetchone()
            
            if existing and skip_existing:
                # Skip if already exists and skip_existing is True
                skipped_count += 1
                continue
            
            # Generate embedding
            print(f"      Generating embedding for {embedding_type}: '{embedding_text[:50]}...'")
            embedding = get_embedding(embedding_text)
            
            if embedding:
                # Format embedding for PostgreSQL
                embedding_str = format_embedding_for_db(embedding)
                
                if existing:
                    # Update existing embedding
                    cursor.execute("""
                        UPDATE public.kb_embeddings
                        SET embedding = %s::vector,
                            updated_at = NOW()
                        WHERE variant_id = %s AND embedding_type = %s AND embedding_text = %s
                    """, (embedding_str, variant_id, embedding_type, embedding_text))
                    conn.commit()  # Commit immediately after successful update
                    updated_count += 1
                    print(f"        ✓ Updated embedding")
                else:
                    # Create new embedding - try INSERT first, if constraint doesn't exist, use UPDATE
                    try:
                        cursor.execute("""
                            INSERT INTO public.kb_embeddings 
                            (variant_id, product_id, embedding_type, embedding_text, embedding, created_at, updated_at)
                            VALUES (%s, %s, %s, %s, %s::vector, NOW(), NOW())
                            ON CONFLICT (variant_id, embedding_type, embedding_text) DO UPDATE SET
                                embedding = EXCLUDED.embedding,
                                updated_at = NOW()
                        """, (variant_id, product_id, embedding_type, embedding_text, embedding_str))
                        conn.commit()  # Commit immediately after successful insert
                        created_count += 1
                        print(f"        ✓ Created embedding")
                    except psycopg2.errors.InvalidColumnReference:
                        # Constraint doesn't exist, use UPDATE approach instead
                        conn.rollback()
                        # Check if exists first
                        cursor.execute("""
                            SELECT id FROM public.kb_embeddings 
                            WHERE variant_id = %s AND embedding_type = %s AND embedding_text = %s
                        """, (variant_id, embedding_type, embedding_text))
                        exists = cursor.fetchone()
                        
                        if exists:
                            cursor.execute("""
                                UPDATE public.kb_embeddings
                                SET embedding = %s::vector,
                                    updated_at = NOW()
                                WHERE variant_id = %s AND embedding_type = %s AND embedding_text = %s
                            """, (embedding_str, variant_id, embedding_type, embedding_text))
                            conn.commit()
                            updated_count += 1
                            print(f"        ✓ Updated embedding")
                        else:
                            # Insert without ON CONFLICT
                            cursor.execute("""
                                INSERT INTO public.kb_embeddings 
                                (variant_id, product_id, embedding_type, embedding_text, embedding, created_at, updated_at)
                                VALUES (%s, %s, %s, %s, %s::vector, NOW(), NOW())
                            """, (variant_id, product_id, embedding_type, embedding_text, embedding_str))
                            conn.commit()
                            created_count += 1
                            print(f"        ✓ Created embedding (no constraint)")
                    except psycopg2.IntegrityError as ie:
                        # If unique constraint violation, try update instead
                        conn.rollback()
                        cursor.execute("""
                            UPDATE public.kb_embeddings
                            SET embedding = %s::vector,
                                updated_at = NOW()
                            WHERE variant_id = %s AND embedding_type = %s AND embedding_text = %s
                        """, (embedding_str, variant_id, embedding_type, embedding_text))
                        conn.commit()
                        updated_count += 1
                        print(f"        ✓ Updated embedding (conflict resolved)")
                    except Exception as e:
                        conn.rollback()
                        raise
            else:
                skipped_count += 1
                print(f"        ⊘ Skipped (failed to generate embedding)")
            
            # Small delay to avoid rate limiting
            time.sleep(0.1)
            
        except psycopg2.Error as e:
            print(f"        ✗ Database error: {e}")
            skipped_count += 1
            # Rollback the current transaction to clear the error state
            try:
                conn.rollback()
            except:
                pass
            # Continue with next embedding
            continue
        except Exception as e:
            print(f"        ✗ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            skipped_count += 1
            # Rollback on any error
            try:
                conn.rollback()
            except:
                pass
            continue
    
    return created_count, updated_count, skipped_count

def generate_embeddings_for_all_variants(limit: Optional[int] = None, skip_existing: bool = False):
    """Generate embeddings for all variants in kb_enriched_variants table"""
    
    print("="*70)
    print("Embedding Generation Service")
    print("="*70)
    
    try:
        # Connect to Supabase
        print("\n[1/4] Connecting to Supabase...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("✓ Connected successfully")
        
        # Get variants to process
        print("\n[2/4] Fetching variants from database...")
        query = """
            SELECT variant_id, product_id, use_cases, best_for, 
                   not_best_for, tradeoffs, ambiguity_triggers
            FROM public.kb_enriched_variants
            ORDER BY variant_id
        """
        if limit:
            query += f" LIMIT {limit}"
        
        cursor.execute(query)
        variants = cursor.fetchall()
        
        if not variants:
            print("✓ No variants found to process")
            cursor.close()
            conn.close()
            return
        
        print(f"✓ Found {len(variants)} variants to process")
        
        # Process variants
        print(f"\n[3/4] Generating embeddings...")
        print("-"*70)
        
        processed_count = 0
        total_embeddings_created = 0
        total_embeddings_updated = 0
        total_embeddings_skipped = 0
        error_count = 0
        
        for idx, variant in enumerate(variants, 1):
            variant_id, product_id, use_cases, best_for, not_best_for, tradeoffs, ambiguity_triggers = variant
            
            # Calculate total words to embed (after splitting by underscores and commas)
            processed_use_cases = process_items_for_embedding(use_cases or [])
            processed_best_for = process_items_for_embedding(best_for or [])
            processed_not_best_for = process_items_for_embedding(not_best_for or [])
            processed_tradeoffs = process_items_for_embedding(tradeoffs or [])
            processed_ambiguity = process_items_for_embedding(ambiguity_triggers or [])
            
            total_items = len(processed_use_cases) + len(processed_best_for) + len(processed_not_best_for) + \
                         len(processed_tradeoffs) + len(processed_ambiguity)
            
            print(f"\n[{idx}/{len(variants)}] Processing variant {variant_id} (product_id: {product_id})")
            print(f"  Total items to embed: {total_items}")
            
            if total_items == 0:
                print(f"  ⊘ No items to embed, skipping")
                continue
            
            try:
                created, updated, skipped = generate_embeddings_for_variant(
                    conn, cursor, variant_id, product_id,
                    use_cases or [], best_for or [], not_best_for or [],
                    tradeoffs or [], ambiguity_triggers or [],
                    skip_existing=skip_existing
                )
                
                total_embeddings_created += created
                total_embeddings_updated += updated
                total_embeddings_skipped += skipped
                processed_count += 1
                
                print(f"  ✓ Summary: Created={created}, Updated={updated}, Skipped={skipped}")
                
                # Note: We commit after each embedding, so no need to commit here
                
            except Exception as e:
                error_count += 1
                print(f"  ✗ Error processing variant {variant_id}: {e}")
                import traceback
                traceback.print_exc()
                conn.rollback()
                continue
            
            # Progress update every 10 variants
            if idx % 10 == 0:
                print(f"\nProgress: {idx}/{len(variants)} variants processed...")
        
        # Final summary
        print("\n" + "="*70)
        print("[4/4] Generation Summary:")
        print("="*70)
        print(f"Variants processed: {processed_count}")
        print(f"Embeddings created: {total_embeddings_created}")
        print(f"Embeddings updated: {total_embeddings_updated}")
        print(f"Embeddings skipped: {total_embeddings_skipped}")
        print(f"Errors: {error_count}")
        print(f"Total embeddings processed: {total_embeddings_created + total_embeddings_updated + total_embeddings_skipped}")
        print("="*70)
        
        # Close connection
        cursor.close()
        conn.close()
        print("\n✓ Embedding generation completed!")
        
    except psycopg2.Error as e:
        print(f"\n✗ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate embeddings for variant data')
    parser.add_argument('--limit', type=int, help='Limit number of variants to process')
    parser.add_argument('--skip-existing', action='store_true', 
                       help='Skip variants that already have embeddings')
    
    args = parser.parse_args()
    
    # Check if Gemini API key is set
    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        print("ERROR: Please set GEMINI_API_KEY in config.json or as environment variable")
        sys.exit(1)
    
    generate_embeddings_for_all_variants(limit=args.limit, skip_existing=args.skip_existing)

