import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import google.generativeai as genai
import sys
import re
from typing import List, Dict, Optional
from flask import Flask, request, jsonify
from flask_cors import CORS

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
DATABASE_URL = CONFIG['database']['url']

# Gemini Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", CONFIG['gemini']['api_key'])
EMBEDDING_MODEL = CONFIG['gemini'].get('embedding_model', 'models/embedding-001')
EMBEDDING_DIMENSIONS = CONFIG['gemini'].get('embedding_dimensions', 768)

# Configure Gemini
if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
    print("Error: GEMINI_API_KEY not set. Please set it in config.json or as environment variable.")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
print(f"Using Gemini embedding model: {EMBEDDING_MODEL} ({EMBEDDING_DIMENSIONS} dimensions)")

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

def preprocess_query(text: str) -> str:
    """
    Preprocess query text to match how embeddings were created.
    Replace underscores with spaces to match embedding format.
    Example: "water_proof" -> "water proof"
    """
    if not text or not text.strip():
        return ""
    
    # Replace underscores with spaces (to match embedding format)
    text = text.replace('_', ' ')
    
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    
    return text.strip()

def format_embedding_for_db(embedding: List[float]) -> str:
    """Convert embedding list to PostgreSQL vector format"""
    if not embedding:
        return None
    # Format: [0.1,0.2,0.3,...] for pgvector
    return '[' + ','.join(str(float(x)) for x in embedding) + ']'

def get_embedding(text: str, task_type: str = "RETRIEVAL_QUERY") -> Optional[List[float]]:
    """Generate embedding for query text using Gemini"""
    if not text or not text.strip():
        return None
    
    # Preprocess query to match embedding format
    processed_text = preprocess_query(text)
    
    if not processed_text:
        return None
    
    try:
        # Use Gemini embedding model
        # RETRIEVAL_QUERY for search queries, RETRIEVAL_DOCUMENT for documents
        result = genai.embed_content(
            model=EMBEDDING_MODEL,
            content=processed_text,
            task_type=task_type
        )
        embedding = result['embedding']
        
        # Validate dimensions
        if embedding and len(embedding) == EMBEDDING_DIMENSIONS:
            return embedding
        else:
            print(f"Warning: Embedding has {len(embedding) if embedding else 0} dimensions, expected {EMBEDDING_DIMENSIONS}")
            return embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None

def semantic_search_structured(query_fields: Dict[str, str], limit: int = 10, min_score: float = 0.6) -> List[Dict]:
    """
    Perform structured semantic search with field-specific matching.
    
    Args:
        query_fields: Dictionary with optional fields:
            - use_case: Query for use_cases embeddings (highest priority)
            - best_for: Query for best_for embeddings (medium priority)
            - not_best_for: Query for not_best_for embeddings (low priority)
            - tradeoff: Query for tradeoffs embeddings (low priority)
            - ambiguity_triggers: Query for ambiguity_triggers embeddings (low priority)
        limit: Maximum number of results to return
        min_score: Minimum similarity score threshold
    
    Priority weights:
        - use_case: 1.0 (highest)
        - best_for: 0.7 (medium)
        - not_best_for, tradeoff, ambiguity_triggers: 0.3 (lowest)
    """
    
    # Priority weights for each field type
    PRIORITY_WEIGHTS = {
        'use_cases': 1.0,        # Highest priority
        'best_for': 0.7,         # Medium priority
        'not_best_for': 0.3,     # Low priority
        'tradeoffs': 0.3,        # Low priority
        'ambiguity_triggers': 0.3 # Low priority
    }
    
    # Field mapping: user field name -> database embedding_type
    FIELD_MAPPING = {
        'use_case': 'use_cases',
        'best_for': 'best_for',
        'not_best_for': 'not_best_for',
        'tradeoff': 'tradeoffs',
        'ambiguity_triggers': 'ambiguity_triggers'
    }
    
    # Generate embeddings for all provided query fields
    query_embeddings = {}
    for field_name, query_text in query_fields.items():
        if query_text and query_text.strip():
            embedding = get_embedding(query_text.strip())
            if embedding:
                db_field_name = FIELD_MAPPING.get(field_name, field_name)
                query_embeddings[db_field_name] = {
                    'embedding': embedding,
                    'embedding_str': format_embedding_for_db(embedding),
                    'weight': PRIORITY_WEIGHTS.get(db_field_name, 0.5),
                    'query_text': query_text.strip()
                }
    
    if not query_embeddings:
        return []
    
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Store matches per variant per field type
    variant_matches = {}  # {variant_id: {field_type: {best_match_info}}}
    
    try:
        # Search each field type separately and collect matches
        for field_type, query_info in query_embeddings.items():
            embedding_str = query_info['embedding_str']
            weight = query_info['weight']
            
            # Search for matches in this specific field type
            cursor.execute("""
                SELECT 
                    ke.variant_id,
                    ke.product_id,
                    ke.embedding_type,
                    ke.embedding_text,
                    1.0 * (1 - (ke.embedding <=> %s::vector)) as similarity_score
                FROM public.kb_embeddings ke
                WHERE ke.embedding_type = %s
                AND (1 - (ke.embedding <=> %s::vector)) >= %s
                ORDER BY ke.embedding <=> %s::vector
                LIMIT %s
            """, (embedding_str, field_type, embedding_str, min_score, embedding_str, limit * 2))
            
            field_results = cursor.fetchall()
            
            # Store best match per variant for this field type
            for result in field_results:
                variant_id = result['variant_id']
                similarity = float(result['similarity_score'])
                
                # Calculate weighted score for this match
                weighted_score = similarity * weight
                
                if variant_id not in variant_matches:
                    variant_matches[variant_id] = {}
                
                # Store the best match for this field type (highest weighted score)
                if field_type not in variant_matches[variant_id] or \
                   weighted_score > variant_matches[variant_id][field_type]['weighted_score']:
                    variant_matches[variant_id][field_type] = {
                        'embedding_text': result['embedding_text'],
                        'similarity_score': similarity,
                        'weighted_score': weighted_score,
                        'weight': weight
                    }
        
        if not variant_matches:
            return []
        
        # Get variant IDs that have at least one match
        variant_ids = list(variant_matches.keys())
        
        # Get full variant details including confidence_score
        placeholders = ','.join(['%s'] * len(variant_ids))
        cursor.execute(f"""
            SELECT 
                kev.variant_id,
                kev.product_id,
                kev.use_cases,
                kev.skill_level,
                kev.portability_score,
                kev.price_tier,
                kev.best_for,
                kev.not_best_for,
                kev.tradeoffs,
                kev.confidence_score,
                COALESCE(kev.confidence_score, 50) as normalized_confidence,
                lp.title as product_title,
                lp.handle as product_handle
            FROM public.kb_enriched_variants kev
            LEFT JOIN public.latest_product lp ON kev.product_id = lp.id
            WHERE kev.variant_id IN ({placeholders})
        """, variant_ids)
        
        variant_details = {r['variant_id']: dict(r) for r in cursor.fetchall()}
        
        # Calculate final scores for each variant
        results = []
        
        for variant_id, field_matches in variant_matches.items():
            if variant_id not in variant_details:
                continue
            
            # Calculate aggregate score
            total_weighted_score = 0.0
            total_weight = 0.0
            match_count = 0
            
            # Collect match information
            match_details = {}
            
            for field_type, match_info in field_matches.items():
                total_weighted_score += match_info['weighted_score']
                total_weight += match_info['weight']
                match_count += 1
                match_details[field_type] = {
                    'embedding_text': match_info['embedding_text'],
                    'similarity_score': match_info['similarity_score']
                }
            
            # Average weighted score (normalized by total weights)
            if total_weight > 0:
                final_score = total_weighted_score / total_weight
            else:
                final_score = 0.0
            
            # Boost score based on number of matches (variants matching multiple criteria are better)
            match_bonus = 0.1 * min(match_count / len(query_embeddings), 1.0)
            final_score = min(final_score + match_bonus, 1.0)
            
            # Add confidence score influence (10% weight)
            confidence = variant_details[variant_id].get('normalized_confidence', 50)
            confidence_factor = (confidence / 100.0) * 0.1
            final_score = min(final_score + confidence_factor, 1.0)
            
            # Build result dictionary
            result_dict = {
                'variant_id': variant_id,
                'product_id': variant_details[variant_id]['product_id'],
                'final_score': final_score,
                'match_count': match_count,
                'total_fields_searched': len(query_embeddings),
                'matches': match_details,
                'confidence_score': variant_details[variant_id].get('confidence_score')
            }
            result_dict.update(variant_details[variant_id])
            results.append(result_dict)
        
        # Sort by final score (highest first)
        results.sort(key=lambda x: -x['final_score'])
        
        # Return top results
        return results[:limit]
        
    finally:
        cursor.close()
        conn.close()

@app.route('/search', methods=['POST'])
def search_endpoint():
    """
    API endpoint for structured semantic search
    
    Accepts structured query with optional fields:
    {
        "use_case": "under water recording",
        "best_for": "water sports players",
        "not_best_for": "deep sea diving below 100m",
        "tradeoff": "4k video is capped at 30fps",
        "ambiguity_triggers": "specific sensor or processor model is missing",
        "limit": 10,
        "min_score": 0.6
    }
    
    All fields except limit and min_score are optional.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Extract query fields (all optional)
        query_fields = {}
        if data.get('use_case'):
            query_fields['use_case'] = str(data['use_case']).strip()
        if data.get('best_for'):
            query_fields['best_for'] = str(data['best_for']).strip()
        if data.get('not_best_for'):
            query_fields['not_best_for'] = str(data['not_best_for']).strip()
        if data.get('tradeoff'):
            query_fields['tradeoff'] = str(data['tradeoff']).strip()
        if data.get('ambiguity_triggers'):
            query_fields['ambiguity_triggers'] = str(data['ambiguity_triggers']).strip()
        
        # At least one query field must be provided
        if not query_fields:
            return jsonify({
                'error': 'At least one query field is required. Provide: use_case, best_for, not_best_for, tradeoff, or ambiguity_triggers'
            }), 400
        
        limit = int(data.get('limit', 10))
        min_score = float(data.get('min_score', 0.6))
        
        results = semantic_search_structured(query_fields, limit=limit, min_score=min_score)
        
        return jsonify({
            'query_fields': query_fields,
            'count': len(results),
            'min_score': min_score,
            'results': results
        })
        
    except ValueError as e:
        return jsonify({'error': f'Invalid parameter: {str(e)}'}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with API information"""
    return jsonify({
        'service': 'Semantic Search API',
        'version': '1.0',
        'endpoints': {
            'search': {
                'path': '/search',
                'method': 'POST',
                'description': 'Perform structured semantic search on product variants',
                'body': {
                    'use_case': 'string (optional) - Query for use_cases embeddings (highest priority)',
                    'best_for': 'string (optional) - Query for best_for embeddings (medium priority)',
                    'not_best_for': 'string (optional) - Query for not_best_for embeddings (low priority)',
                    'tradeoff': 'string (optional) - Query for tradeoffs embeddings (low priority)',
                    'ambiguity_triggers': 'string (optional) - Query for ambiguity_triggers embeddings (low priority)',
                    'limit': 'integer (optional, default: 10) - Number of results',
                    'min_score': 'float (optional, default: 0.6) - Minimum similarity score',
                    'note': 'At least one query field (use_case, best_for, etc.) is required'
                },
                'example': {
                    'use_case': 'under water recording',
                    'best_for': 'water sports players',
                    'not_best_for': 'deep sea diving below 100m',
                    'limit': 10
                }
            },
            'health': {
                'path': '/health',
                'method': 'GET',
                'description': 'Health check endpoint'
            }
        },
        'model': 'gemini',
        'embedding_model': EMBEDDING_MODEL,
        'embedding_dimensions': EMBEDDING_DIMENSIONS
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'model': 'gemini', 'embedding_model': EMBEDDING_MODEL})

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5500))
    print(f"Starting semantic search service on port {port}...")
    print(f"Using Gemini embedding model: {EMBEDDING_MODEL}")
    app.run(host='0.0.0.0', port=port, debug=True)