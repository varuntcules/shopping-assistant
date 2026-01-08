import json
import os
import psycopg2
import google.generativeai as genai
import time
import sys
import re
from typing import Dict, List, Optional, Set
from datetime import datetime

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", CONFIG['gemini']['api_key'])
GEMINI_MODEL = CONFIG['gemini']['model']
MAX_RETRIES = CONFIG['gemini']['max_retries']
API_DELAY = CONFIG['gemini']['delay_between_calls']
PRODUCTS_TO_PROCESS = CONFIG['processing']['products_to_process']
SKIP_PROCESSED = CONFIG['processing']['skip_processed_variants']
PROMPT_CONFIG = CONFIG['prompt_template']

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)

def clean_html(text: str) -> str:
    """Clean HTML tags from text"""
    if not text:
        return ""
    text = text.replace('<p>', '\n').replace('</p>', '').replace('<strong>', '').replace('</strong>', '')
    text = text.replace('<br>', '\n').replace('<br/>', '\n').replace('<br />', '\n')
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()

def build_prompt_from_config(product_title: str, body_html: str, tags: str, variant_title: str, variant_price: str) -> str:
    """Build prompt from structured config sections"""
    body_text = clean_html(body_html)
    
    # Replace placeholders in product information fields
    product_info_fields = []
    for field_template in PROMPT_CONFIG['product_information_section']['fields']:
        field = field_template.format(
            product_title=product_title,
            variant_title=variant_title,
            variant_price=variant_price,
            tags=tags or "None",
            product_description=body_text if body_text else "No description available"
        )
        product_info_fields.append(f"- {field}")
    
    # Build guidelines section
    guidelines_text = []
    for key, guideline in PROMPT_CONFIG['guidelines'].items():
        guideline_line = f"{len(guidelines_text) + 1}. **{key}**: {guideline['description']}"
        
        if 'options' in guideline:
            # For fields with options (skill_level, price_tier, etc.)
            options_list = []
            for opt_key, opt_desc in guideline['options'].items():
                options_list.append(f'   - "{opt_key}": {opt_desc}')
            guideline_line += "\n" + "\n".join(options_list)
        elif 'scale' in guideline:
            # For portability_score with scale
            scale_list = []
            for scale_key, scale_desc in guideline['scale'].items():
                scale_list.append(f'   - {scale_key}: {scale_desc}')
            guideline_line += "\n" + "\n".join(scale_list)
        elif 'examples' in guideline:
            examples_str = ', '.join(['"' + ex + '"' for ex in guideline['examples']])
            guideline_line += f" (e.g., {examples_str})"
        if 'format' in guideline:
            guideline_line += f". {guideline['format']}"
        if 'instruction' in guideline:
            guideline_line += f". {guideline['instruction']}"
        
        guidelines_text.append(guideline_line)
    
    # Build JSON format example
    json_format_str = json.dumps(PROMPT_CONFIG['json_format'], indent=2)
    
    # Assemble full prompt
    prompt_parts = [
        PROMPT_CONFIG['introduction'],
        "",
        PROMPT_CONFIG['product_information_section']['header'],
        "\n".join(product_info_fields),
        "",
        PROMPT_CONFIG['task_description'],
        "",
        json_format_str,
        "",
        "Guidelines:",
        "\n\n".join(guidelines_text),
        "",
        "Important:",
        "\n".join([f"- {instruction}" for instruction in PROMPT_CONFIG['important_instructions']]),
        "",
        PROMPT_CONFIG['closing']
    ]
    
    return "\n".join(prompt_parts)

def create_enrichment_prompt(product_title: str, body_html: str, tags: str, variant_title: str, variant_price: str) -> str:
    """Create a comprehensive prompt for Gemini to analyze and enrich variant data"""
    return build_prompt_from_config(product_title, body_html, tags, variant_title, variant_price)

def call_gemini_api(prompt: str) -> Optional[Dict]:
    """Call Gemini API with retry logic and error handling"""
    for attempt in range(MAX_RETRIES):
        try:
            print(f"      Calling Gemini API (attempt {attempt + 1}/{MAX_RETRIES})...")
            response = model.generate_content(prompt)
            
            # Extract JSON from response
            response_text = response.text.strip()
            
            # Remove markdown code blocks if present
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.startswith('```'):
                response_text = response_text[3:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            response_text = response_text.strip()
            
            # Parse JSON
            result = json.loads(response_text)
            print(f"      ✓ Successfully parsed JSON response")
            return result
            
        except json.JSONDecodeError as e:
            print(f"      ✗ JSON parsing error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                print(f"      Response preview: {response_text[:500]}...")
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                print(f"      Failed to parse JSON after {MAX_RETRIES} attempts.")
                print(f"      Full response was: {response_text}")
                return None
                
        except Exception as e:
            print(f"      ✗ API error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                return None
    
    return None

def get_processed_variant_ids(cursor) -> Set[int]:
    """Get set of variant IDs that are already processed"""
    cursor.execute("SELECT variant_id FROM public.kb_enriched_variants")
    results = cursor.fetchall()
    return {row[0] for row in results}

def process_variant(variant: Dict, product_id: int, product_title: str, body_html: str, tags: str) -> Optional[Dict]:
    """Process a single variant through Gemini API"""
    variant_id = variant.get('id')
    variant_title = variant.get('title', '')
    variant_price = variant.get('price', '0')
    
    if not variant_id:
        print(f"      ⚠ Warning: Variant missing ID, skipping")
        return None
    
    print(f"      Processing variant {variant_id}:")
    print(f"        Title: {variant_title}")
    print(f"        Price: {variant_price}")
    
    # Create prompt
    prompt = create_enrichment_prompt(
        product_title=product_title,
        body_html=body_html or '',
        tags=tags or '',
        variant_title=variant_title,
        variant_price=variant_price
    )
    
    # Call Gemini API
    enriched_data = call_gemini_api(prompt)
    
    if enriched_data:
        # Ensure variant_id and product_id are set correctly
        enriched_data['variant_id'] = variant_id
        enriched_data['product_id'] = product_id
        
        # Print summary
        print(f"      ✓ Enrichment successful:")
        print(f"        Use cases: {enriched_data.get('use_cases', [])}")
        print(f"        Skill level: {enriched_data.get('skill_level')}")
        print(f"        Price tier: {enriched_data.get('price_tier')}")
        print(f"        Portability: {enriched_data.get('portability_score')}/5")
        confidence_score = enriched_data.get('confidence_score')
        if confidence_score is not None:
            print(f"        Confidence: {confidence_score}/100")
        return enriched_data
    else:
        print(f"      ✗ Failed to enrich variant {variant_id}")
        return None

def save_enriched_variant_to_db(cursor, enriched_data: Dict):
    """Save or update enriched variant data in the database"""
    insert_query = """
        INSERT INTO public.kb_enriched_variants (
            variant_id, product_id, use_cases, skill_level, portability_score,
            price_tier, best_for, not_best_for, tradeoffs, confidence_notes,
            confidence_score, ambiguity_triggers, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
        )
        ON CONFLICT (variant_id) DO UPDATE SET
            product_id = EXCLUDED.product_id,
            use_cases = EXCLUDED.use_cases,
            skill_level = EXCLUDED.skill_level,
            portability_score = EXCLUDED.portability_score,
            price_tier = EXCLUDED.price_tier,
            best_for = EXCLUDED.best_for,
            not_best_for = EXCLUDED.not_best_for,
            tradeoffs = EXCLUDED.tradeoffs,
            confidence_notes = EXCLUDED.confidence_notes,
            confidence_score = EXCLUDED.confidence_score,
            ambiguity_triggers = EXCLUDED.ambiguity_triggers,
            updated_at = NOW()
    """
    
    # Get confidence_score and ensure it's within valid range (0-100)
    confidence_score = enriched_data.get('confidence_score')
    if confidence_score is not None:
        confidence_score = max(0, min(100, int(confidence_score)))
    
    cursor.execute(insert_query, (
        enriched_data.get('variant_id'),
        enriched_data.get('product_id'),
        enriched_data.get('use_cases', []),
        enriched_data.get('skill_level'),
        enriched_data.get('portability_score'),
        enriched_data.get('price_tier'),
        enriched_data.get('best_for', []),
        enriched_data.get('not_best_for', []),
        enriched_data.get('tradeoffs', []),
        enriched_data.get('confidence_notes', []),
        confidence_score,
        enriched_data.get('ambiguity_triggers', [])
    ))
    print(f"      ✓ Saved to database")

def verify_variants_status(cursor, product_ids: List[int]) -> Dict:
    """Verify which variants are already processed for given products"""
    print("\n[VERIFICATION] Checking which variants are already processed...")
    
    # Get all variants for these products
    placeholders = ','.join(['%s'] * len(product_ids))
    query = f"""
        SELECT 
            lp.id as product_id,
            jsonb_array_elements(lp.variants)->>'id' as variant_id
        FROM public.latest_product lp
        WHERE lp.id IN ({placeholders})
    """
    
    cursor.execute(query, product_ids)
    all_variants = cursor.fetchall()
    
    # Get processed variant IDs
    processed_variant_ids = get_processed_variant_ids(cursor)
    
    # Categorize variants
    status = {
        'total_products': len(product_ids),
        'total_variants': 0,
        'processed_variants': [],
        'unprocessed_variants': [],
        'products_summary': {}
    }
    
    for product_id, variant_id_str in all_variants:
        variant_id = int(variant_id_str) if variant_id_str else None
        if variant_id:
            status['total_variants'] += 1
            if variant_id in processed_variant_ids:
                status['processed_variants'].append(variant_id)
            else:
                status['unprocessed_variants'].append(variant_id)
            
            # Track per product
            if product_id not in status['products_summary']:
                status['products_summary'][product_id] = {'processed': 0, 'unprocessed': 0}
            
            if variant_id in processed_variant_ids:
                status['products_summary'][product_id]['processed'] += 1
            else:
                status['products_summary'][product_id]['unprocessed'] += 1
    
    # Print summary
    print(f"  Total products: {status['total_products']}")
    print(f"  Total variants: {status['total_variants']}")
    print(f"  Already processed: {len(status['processed_variants'])}")
    print(f"  Need processing: {len(status['unprocessed_variants'])}")
    print(f"\n  Per-product breakdown:")
    for product_id, summary in status['products_summary'].items():
        print(f"    Product {product_id}: {summary['processed']} processed, {summary['unprocessed']} unprocessed")
    
    if status['processed_variants']:
        print(f"\n  Already processed variant IDs: {status['processed_variants']}")
    
    return status

def test_enrichment_flow():
    """Test script: Process configured number of products from the database"""
    print("="*70)
    print("TEST MODE: Product Variant Enrichment Service")
    print(f"Processing first {PRODUCTS_TO_PROCESS} products (from config.json)")
    print(f"Skip processed variants: {SKIP_PROCESSED}")
    print("="*70)
    
    try:
        # Connect to Supabase
        print("\n[1/5] Connecting to Supabase...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        print("✓ Connected successfully")
        
        # Get products to process
        print(f"\n[2/5] Fetching first {PRODUCTS_TO_PROCESS} products from database...")
        query = """
            SELECT id, title, body_html, tags, variants
            FROM public.latest_product
            ORDER BY id
            LIMIT %s
        """
        
        cursor.execute(query, (PRODUCTS_TO_PROCESS,))
        products = cursor.fetchall()
        
        if not products:
            print("✗ No products found in the database!")
            cursor.close()
            conn.close()
            return
        
        product_ids = [p[0] for p in products]
        print(f"✓ Found {len(products)} products to process")
        
        # Verify which variants are already processed
        verification_status = verify_variants_status(cursor, product_ids)
        
        if SKIP_PROCESSED:
            processed_variant_ids = set(verification_status['processed_variants'])
            print(f"\n[3/5] Will skip {len(processed_variant_ids)} already processed variants")
        else:
            processed_variant_ids = set()
            print(f"\n[3/5] Will process all variants (including already processed ones)")
        
        # Process products
        print(f"\n[4/5] Processing {len(products)} products through Gemini API...")
        print("-"*70)
        
        processed_count = 0
        success_count = 0
        skipped_count = 0
        error_count = 0
        
        for idx, product in enumerate(products, 1):
            product_id, product_title, body_html, tags, variants_json = product
            
            # Parse variants JSON
            try:
                variants = json.loads(variants_json) if isinstance(variants_json, str) else variants_json
            except:
                variants = []
            
            print(f"\n[{idx}/{len(products)}] Product ID: {product_id}")
            print(f"  Title: {product_title}")
            print(f"  Tags: {tags or 'None'}")
            print(f"  Total variants: {len(variants)}")
            
            if not variants:
                print("  ⚠ No variants found, skipping")
                continue
            
            product_processed = 0
            product_skipped = 0
            
            # Process each variant
            for variant_idx, variant in enumerate(variants, 1):
                variant_id = variant.get('id')
                
                if not variant_id:
                    continue
                
                print(f"\n  Variant {variant_idx}/{len(variants)}:")
                
                # Skip if already processed
                if SKIP_PROCESSED and variant_id in processed_variant_ids:
                    print(f"      ⊘ Skipped (already processed)")
                    skipped_count += 1
                    product_skipped += 1
                    continue
                
                processed_count += 1
                
                # Process variant with Gemini
                enriched_data = process_variant(
                    variant=variant,
                    product_id=product_id,
                    product_title=product_title or '',
                    body_html=body_html or '',
                    tags=tags or ''
                )
                
                if enriched_data:
                    try:
                        save_enriched_variant_to_db(cursor, enriched_data)
                        success_count += 1
                        processed_variant_ids.add(variant_id)  # Track as processed
                        
                        # Show full enriched data for verification
                        print(f"      Full enriched data:")
                        print(f"        {json.dumps(enriched_data, indent=10)}")
                        
                    except Exception as e:
                        error_count += 1
                        print(f"      ✗ Error saving to database: {e}")
                else:
                    error_count += 1
                
                # Small delay to avoid rate limiting
                if variant_idx < len(variants):
                    time.sleep(API_DELAY)
            
            # Commit after each product
            conn.commit()
            
            if product_skipped > 0:
                print(f"\n  ✓ Product {product_id} completed: {product_processed} processed, {product_skipped} skipped (Saved to database)")
            else:
                print(f"\n  ✓ Product {product_id} completed: {product_processed} variants processed (Saved to database)")
            
            # Small delay between products
            if idx < len(products):
                time.sleep(1)
        
        # Final summary
        print("\n" + "="*70)
        print("[5/5] Test Summary:")
        print("="*70)
        print(f"Products processed: {len(products)}")
        print(f"Variants processed: {processed_count}")
        print(f"Variants skipped (already processed): {skipped_count}")
        print(f"Successfully enriched: {success_count}")
        print(f"Errors: {error_count}")
        print("="*70)
        
        # Verify data in database
        print("\n[VERIFICATION] Checking saved data in database...")
        cursor.execute("""
            SELECT variant_id, product_id, skill_level, price_tier, use_cases
            FROM public.kb_enriched_variants
            WHERE product_id IN (
                SELECT id FROM public.latest_product ORDER BY id LIMIT %s
            )
            ORDER BY product_id, variant_id
        """, (PRODUCTS_TO_PROCESS,))
        
        saved_records = cursor.fetchall()
        print(f"✓ Found {len(saved_records)} enriched variants in database:")
        for record in saved_records:
            variant_id, product_id, skill_level, price_tier, use_cases = record
            print(f"  Variant {variant_id} (Product {product_id}): {skill_level} | {price_tier} | {len(use_cases)} use cases")
        
        # Close connection
        cursor.close()
        conn.close()
        print("\n✓ Test completed successfully!")
        print("\nNext steps:")
        print("  1. Review the enriched data above")
        print("  2. Check the database records")
        print("  3. If everything looks good, run enrich_variants.py for full processing")
        
    except psycopg2.Error as e:
        print(f"\n✗ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Check if API key is set
    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        print("ERROR: Please set your GEMINI_API_KEY environment variable or update it in config.json")
        sys.exit(1)
    
    test_enrichment_flow()
