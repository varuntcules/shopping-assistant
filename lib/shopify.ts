import { ProductCard, ProductSortKey, ShopifySearchParams } from "./types";

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;
const SHOPIFY_STOREFRONT_API_VERSION = process.env.SHOPIFY_STOREFRONT_API_VERSION || "2025-07";

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const productCache = new Map<string, CacheEntry<ProductCard[]>>();
const CACHE_TTL = 60 * 1000; // 60 seconds

function getCacheKey(params: ShopifySearchParams): string {
  return `${params.query}|${params.first}|${params.sortKey}|${params.reverse}`;
}

function getFromCache(key: string): ProductCard[] | null {
  const entry = productCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    productCache.delete(key);
    return null;
  }
  
  return entry.data;
}

function setCache(key: string, data: ProductCard[]): void {
  productCache.set(key, { data, timestamp: Date.now() });
}

// GraphQL query for products
const PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!, $sortKey: ProductSortKeys, $reverse: Boolean) {
    products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

interface ShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
}

interface ShopifyGraphQLResponse {
  data?: {
    products: {
      edges: Array<{
        node: ShopifyProductNode;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

async function shopifyFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const endpoint = `https://${SHOPIFY_STORE_DOMAIN}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`;
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`);
  }

  return json;
}

function mapToProductCard(node: ShopifyProductNode): ProductCard {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    vendor: node.vendor,
    productType: node.productType,
    price: {
      amount: node.priceRange.minVariantPrice.amount,
      currencyCode: node.priceRange.minVariantPrice.currencyCode,
    },
    image: {
      url: node.featuredImage?.url || "/placeholder-product.png",
      altText: node.featuredImage?.altText || null,
    },
    url: `https://${SHOPIFY_STORE_DOMAIN}/products/${node.handle}`,
  };
}

// Map our sort keys to Shopify's ProductSortKeys enum
function mapSortKey(sortKey: ProductSortKey): string {
  // Shopify Storefront API uses these exact values
  const mapping: Record<ProductSortKey, string> = {
    RELEVANCE: "RELEVANCE",
    BEST_SELLING: "BEST_SELLING",
    PRICE: "PRICE",
    CREATED_AT: "CREATED_AT",
    TITLE: "TITLE",
    PRODUCT_TYPE: "PRODUCT_TYPE",
    VENDOR: "VENDOR",
  };
  return mapping[sortKey] || "RELEVANCE";
}

export async function searchProducts(params: ShopifySearchParams): Promise<ProductCard[]> {
  const cacheKey = getCacheKey(params);
  
  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log("[Shopify] Cache hit for:", cacheKey);
    return cached;
  }

  console.log("[Shopify] Fetching products with params:", params);

  try {
    const response = await shopifyFetch<ShopifyGraphQLResponse>(PRODUCTS_QUERY, {
      query: params.query,
      first: params.first,
      sortKey: mapSortKey(params.sortKey),
      reverse: params.reverse,
    });

    if (!response.data) {
      console.error("[Shopify] No data in response");
      return [];
    }

    const products = response.data.products.edges.map((edge) => mapToProductCard(edge.node));
    
    // Cache the results
    setCache(cacheKey, products);
    
    console.log(`[Shopify] Found ${products.length} products`);
    return products;
  } catch (error) {
    console.error("[Shopify] Error fetching products:", error);
    throw error;
  }
}

