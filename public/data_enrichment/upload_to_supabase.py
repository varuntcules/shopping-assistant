import json
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime
import sys

# Supabase connection URL
DATABASE_URL = "postgresql://postgres.aorwlucrbdhneoxiuzpi:OsbMYVnSnTaQFmoE@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"

def parse_datetime(date_string):
    """Parse Shopify datetime string to PostgreSQL datetime"""
    if date_string is None:
        return None
    try:
        # Shopify datetime format: "2025-12-09T17:49:35+05:30"
        # fromisoformat handles timezone offsets correctly
        return datetime.fromisoformat(date_string)
    except Exception:
        return None

def upload_products_to_supabase(json_file_path="product.json"):
    """
    Upload products from JSON file to Supabase latest_product table.
    Excludes products that already exist in the database.
    """
    try:
        # Read the JSON file
        print(f"Reading products from {json_file_path}...")
        with open(json_file_path, 'r', encoding='utf-8') as f:
            products = json.load(f)
        
        print(f"Found {len(products)} products in JSON file")
        
        # Connect to Supabase
        print("Connecting to Supabase...")
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Query existing product IDs from database
        print("Checking for existing products in database...")
        cursor.execute("SELECT id FROM latest_product")
        existing_ids = {row[0] for row in cursor.fetchall()}
        print(f"Found {len(existing_ids)} existing products in database")
        
        # Filter out products that already exist
        new_products = [p for p in products if p.get('id') not in existing_ids]
        skipped_count = len(products) - len(new_products)
        
        print(f"Products to insert: {len(new_products)}")
        print(f"Products skipped (already exist): {skipped_count}")
        
        if len(new_products) == 0:
            print("\nNo new products to insert. All products already exist in the database.")
            cursor.close()
            conn.close()
            return
        
        # Prepare data for insertion
        insert_count = 0
        error_count = 0
        
        for idx, product in enumerate(new_products, 1):
            try:
                # Prepare the data
                product_data = (
                    product.get('id'),
                    product.get('title'),
                    product.get('body_html'),
                    product.get('vendor'),
                    product.get('product_type'),
                    parse_datetime(product.get('created_at')),
                    product.get('handle'),
                    parse_datetime(product.get('updated_at')),
                    parse_datetime(product.get('published_at')),
                    product.get('template_suffix'),
                    product.get('published_scope'),
                    product.get('tags'),
                    product.get('status'),
                    product.get('admin_graphql_api_id'),
                    json.dumps(product.get('variants', [])),  # Store as JSONB
                    json.dumps(product.get('options', [])),   # Store as JSONB
                    json.dumps(product.get('images', []))     # Store as JSONB
                )
                
                # Insert new products only (no conflict handling needed since we pre-filtered)
                insert_query = """
                    INSERT INTO latest_product (
                        id, title, body_html, vendor, product_type, created_at,
                        handle, updated_at, published_at, template_suffix,
                        published_scope, tags, status, admin_graphql_api_id,
                        variants, options, images
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                """
                
                cursor.execute(insert_query, product_data)
                insert_count += 1
                
                # Show progress every 100 products
                if idx % 100 == 0:
                    print(f"Processed {idx}/{len(new_products)} products... (Inserted: {insert_count}, Errors: {error_count})")
                    
            except Exception as e:
                error_count += 1
                print(f"Error processing product {product.get('id', 'unknown')}: {str(e)}")
                continue
        
        # Commit all changes
        print("Committing changes to database...")
        conn.commit()
        
        print("\n" + "="*50)
        print("Upload Summary:")
        print(f"Total products in JSON file: {len(products)}")
        print(f"Products skipped (already exist): {skipped_count}")
        print(f"New products inserted: {insert_count}")
        print(f"Errors: {error_count}")
        print("="*50)
        
        # Close connection
        cursor.close()
        conn.close()
        print("\nUpload completed successfully!")
        
    except FileNotFoundError:
        print(f"Error: File '{json_file_path}' not found!")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in file '{json_file_path}'!")
        sys.exit(1)
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # You can also pass the file path as an argument
    json_file = sys.argv[1] if len(sys.argv) > 1 else "product.json"
    upload_products_to_supabase(json_file)

