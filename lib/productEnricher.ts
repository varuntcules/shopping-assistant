import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Synonym mappings for common product terms
const SYNONYM_MAP: Record<string, string[]> = {
  "t-shirt": ["tee", "tshirt", "top", "t shirt"],
  "shirt": ["button-down", "dress shirt", "formal shirt"],
  "jeans": ["denim", "pants", "trousers"],
  "sneakers": ["trainers", "running shoes", "athletic shoes", "sports shoes"],
  "shoes": ["footwear", "boots", "sandals"],
  "jacket": ["coat", "blazer", "outerwear"],
  "dress": ["gown", "frock", "outfit"],
  "watch": ["timepiece", "wristwatch"],
  "bag": ["handbag", "purse", "backpack", "tote"],
  "jewelry": ["jewellery", "accessories", "ornaments"],
  "electronics": ["gadgets", "devices", "tech"],
  "phone": ["mobile", "smartphone", "cellphone"],
  "laptop": ["notebook", "computer", "pc"],
  "headphones": ["earphones", "earbuds", "headset"],
};

// Price tier thresholds (in INR)
const PRICE_TIERS = {
  budget: { max: 500, label: "budget" },
  affordable: { min: 500, max: 1000, label: "affordable" },
  midRange: { min: 1000, max: 2000, label: "mid-range" },
  premium: { min: 2000, max: 5000, label: "premium" },
  luxury: { min: 5000, label: "luxury" },
};

export interface EnrichedProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  imageAlt: string | null;
  originalTags: string[];
  // Enriched fields
  smartTags: string[];
  synonyms: string[];
  priceTier: string;
  allTags: string[]; // Combined: original + smart + synonyms + priceTier
}

interface GeminiTagsResponse {
  categories: string[];
  styles: string[];
  occasions: string[];
  materials: string[];
  keywords: string[];
}

const tagsSchema = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Category refinements (e.g., casual wear, formal, sportswear, ethnic)",
    },
    styles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Style descriptors (e.g., minimalist, vintage, trendy, classic)",
    },
    occasions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Suitable occasions (e.g., wedding, daily wear, party, office)",
    },
    materials: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Material/quality hints from title/description (e.g., cotton, silk, leather)",
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Other relevant search keywords",
    },
  },
  required: ["categories", "styles", "occasions", "materials", "keywords"],
};

const systemPrompt = `You are a product tagging assistant. Given a product's title, type, vendor, and description, generate relevant tags for search optimization.

Rules:
1. Output valid JSON only.
2. Keep tags concise (1-3 words each).
3. Generate 2-5 tags per category, or empty array if not applicable.
4. Focus on what customers might search for.
5. Be specific to the product, not generic.`;

/**
 * Generate smart tags using Gemini
 */
async function generateSmartTags(product: {
  title: string;
  productType: string;
  vendor: string;
  description: string;
}): Promise<string[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const prompt = `Product Title: ${product.title}
Product Type: ${product.productType || "Unknown"}
Vendor: ${product.vendor || "Unknown"}
Description: ${product.description?.slice(0, 300) || "No description"}

Generate tags for this product:`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: tagsSchema,
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) {
      return [];
    }

    const parsed = JSON.parse(text) as GeminiTagsResponse;
    
    // Flatten all tags into a single array
    const allTags = [
      ...parsed.categories,
      ...parsed.styles,
      ...parsed.occasions,
      ...parsed.materials,
      ...parsed.keywords,
    ];
    
    // Deduplicate and lowercase
    return [...new Set(allTags.map((t) => t.toLowerCase().trim()))].filter(Boolean);
  } catch (error) {
    console.error("[Enricher] Error generating smart tags:", error);
    return [];
  }
}

/**
 * Get synonyms for a product based on title and type
 */
function getSynonyms(title: string, productType: string): string[] {
  const synonyms: Set<string> = new Set();
  const searchText = `${title} ${productType}`.toLowerCase();
  
  for (const [term, syns] of Object.entries(SYNONYM_MAP)) {
    if (searchText.includes(term)) {
      syns.forEach((s) => synonyms.add(s));
      synonyms.add(term);
    }
    // Also check if any synonym is in the text
    for (const syn of syns) {
      if (searchText.includes(syn)) {
        synonyms.add(term);
        syns.forEach((s) => synonyms.add(s));
        break;
      }
    }
  }
  
  return [...synonyms];
}

/**
 * Determine price tier based on price in INR
 */
function getPriceTier(price: number): string {
  if (price < PRICE_TIERS.budget.max) return PRICE_TIERS.budget.label;
  if (price < PRICE_TIERS.affordable.max!) return PRICE_TIERS.affordable.label;
  if (price < PRICE_TIERS.midRange.max!) return PRICE_TIERS.midRange.label;
  if (price < PRICE_TIERS.premium.max!) return PRICE_TIERS.premium.label;
  return PRICE_TIERS.luxury.label;
}

/**
 * Strip HTML tags from description
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Check at runtime to support scripts that load dotenv after module import
function shouldSkipGeminiTagging(): boolean {
  return process.env.SKIP_GEMINI_TAGGING === "true";
}

/**
 * Enrich a single product with smart tags, synonyms, and price tier
 */
export async function enrichProduct(product: {
  id: string | number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  body_html?: string;
  tags?: string | string[];
  variants?: Array<{ price: string }>;
  images?: Array<{ src: string; alt?: string }>;
}): Promise<EnrichedProduct> {
  // Parse price from first variant
  const price = product.variants?.[0]?.price
    ? parseFloat(product.variants[0].price)
    : 0;
  
  // Parse original tags (can be comma-separated string or array)
  const originalTags = Array.isArray(product.tags)
    ? product.tags
    : (product.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  
  // Strip HTML from description
  const description = stripHtml(product.body_html || "");
  
  // Get image
  const imageUrl = product.images?.[0]?.src || "";
  const imageAlt = product.images?.[0]?.alt || null;
  
  // Generate smart tags with Gemini (skip if flag is set)
  let smartTags: string[] = [];
  if (!shouldSkipGeminiTagging()) {
    smartTags = await generateSmartTags({
      title: product.title,
      productType: product.product_type,
      vendor: product.vendor,
      description,
    });
  }
  
  // Get synonyms
  const synonyms = getSynonyms(product.title, product.product_type);
  
  // Get price tier
  const priceTier = getPriceTier(price);
  
  // Combine all tags
  const allTags = [
    ...originalTags.map((t) => t.toLowerCase()),
    ...smartTags,
    ...synonyms,
    priceTier,
    product.product_type?.toLowerCase(),
    product.vendor?.toLowerCase(),
  ].filter(Boolean);
  
  // Deduplicate
  const uniqueTags = [...new Set(allTags)];
  
  return {
    id: String(product.id),
    title: product.title,
    handle: product.handle,
    vendor: product.vendor || "",
    productType: product.product_type || "",
    description,
    price,
    currency: "INR", // Assuming INR based on api-guide.md
    imageUrl,
    imageAlt,
    originalTags,
    smartTags,
    synonyms,
    priceTier,
    allTags: uniqueTags,
  };
}

/**
 * Enrich multiple products (with rate limiting)
 */
export async function enrichProducts(
  products: Array<{
    id: string | number;
    title: string;
    handle: string;
    vendor: string;
    product_type: string;
    body_html?: string;
    tags?: string | string[];
    variants?: Array<{ price: string }>;
    images?: Array<{ src: string; alt?: string }>;
  }>
): Promise<EnrichedProduct[]> {
  const results: EnrichedProduct[] = [];
  
  // Process sequentially to avoid rate limits
  for (let i = 0; i < products.length; i++) {
    console.log(`[Enricher] Processing product ${i + 1}/${products.length}: ${products[i].title}`);
    
    const enriched = await enrichProduct(products[i]);
    results.push(enriched);
    
    // Delay between products to respect Gemini rate limits (5 req/min on free tier)
    // 12 seconds = 5 requests per minute max
    if (i < products.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 12000));
    }
  }
  
  return results;
}

