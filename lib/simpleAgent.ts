/**
 * Simple Agent - Uses only actual DB columns
 * 
 * Collects information through clarifying questions:
 * - use_case (required) → search kb_embeddings.embedding_text where embedding_type='use_cases'
 * - price_min, price_max (optional) → filter latest_product.variants->0->>'price'
 */

import { GoogleGenAI, Type } from "@google/genai";
import { ProductResult, searchProducts, searchProductsByType } from "./simpleSearch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

/**
 * Educational context stored from educational content turns
 */
export interface EducationalContext {
  topic: string;              // e.g., "sensor sizes"
  relatedUseCases: string[];  // e.g., ["travel vlogging", "low light"]
  // Additional discussed attributes from education
  recommendedSensorSizes?: string[];  // e.g., ["APS-C", "Micro Four Thirds"]
  recommendedFeatures?: string[];     // e.g., ["lightweight", "portable", "good low light"]
  keyTakeaways?: string[];            // Key points the user should remember
  timestamp: number;
}

/**
 * Collected information state
 */
export interface CollectedInfo {
  use_case: string | null;
  product_type: string | null; // 'tripod', 'light', 'camera', etc.
  price_min: number | null;
  price_max: number | null;
  skill_level: string | null; // 'beginner' | 'intermediate' | 'pro'
  // Store educational context for subsequent turns
  educationalContext: EducationalContext | null;
}

/**
 * Response from the agent
 */
export interface SimpleAgentResponse {
  message: string;
  products: ProductResult[];
  collectedInfo: CollectedInfo; // Return updated state
  ui: {
    type: "question" | "recommendation" | "recovery";
    chips?: string[];
  };
}

/**
 * Gemini schema for extracting search params from user message
 */
const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    use_case: { 
      type: Type.STRING, 
      description: "The use case extracted from user message (e.g., 'travel vlogging', 'studio photography'). If educational context is provided and user references that discussion, infer use_case from context. Return null if not mentioned and no context inference possible." 
    },
    product_type: {
      type: Type.STRING,
      description: "Product type or category if user is asking for a specific product type (e.g., 'tripod', 'light', 'camera', 'lens', 'microphone'). Return null if not mentioned. This is for when user says 'show me tripods' or 'I need lights'."
    },
    price_min: { 
      type: Type.NUMBER, 
      description: "Minimum price in INR if mentioned. Convert '50k' to 50000, '1 lakh' to 100000. Return null if not mentioned." 
    },
    price_max: { 
      type: Type.NUMBER, 
      description: "Maximum price in INR if mentioned. Convert '50k' to 50000, '1 lakh' to 100000, 'under 10k' means max: 10000. Return null if not mentioned." 
    },
    skill_level: { 
      type: Type.STRING, 
      description: "Skill level if mentioned: 'beginner', 'intermediate', or 'pro'. Return null if not mentioned." 
    },
    acknowledgment: { 
      type: Type.STRING, 
      description: "Brief acknowledgment of what user said (1-2 sentences)" 
    },
  },
  required: ["acknowledgment"],
};

const systemPrompt = `You are a helpful camera store assistant. Extract information from user messages.

EXTRACTION RULES:
- Extract use_case if mentioned (travel vlogging, studio photography, wildlife, events, etc.)
- IMPORTANT: If educational context is provided, use it to infer use_case when the user references that discussion
  - If user says "that makes sense", "I'll go with APS-C", "show me products with that" after learning about travel vlogging → infer use_case from context
  - The educational context tells you what the previous conversation was about
- Extract product_type if user is asking for a specific product category (tripod, light, camera, lens, microphone, etc.)
  - Examples: "show me tripods" → product_type: "tripod"
  - "I need lights" → product_type: "light"
  - "give me cameras" → product_type: "camera"
- Extract price: convert "50k" to 50000, "1 lakh" to 100000, "under 50k" means price_max: 50000
- Extract skill_level: "beginner", "intermediate", or "pro" (normalize to lowercase)
- Keep acknowledgment brief and friendly

Examples:
- "I want a camera for travel vlogging" → use_case: "travel vlogging"
- "show me tripods only" → product_type: "tripod"
- "I need lights" → product_type: "light"
- "under 50k" → price_max: 50000
- "50000 to 100000" → price_min: 50000, price_max: 100000
- "I'm a beginner" → skill_level: "beginner"
- "for professionals" → skill_level: "pro"
- (with educational context about "travel vlogging") "APS-C makes sense, show me options" → use_case: "travel vlogging"`;

/**
 * Extract search params from user message using Gemini
 * @param message - The user's message to extract params from
 * @param educationalContext - Optional context from previous educational content
 */
async function extractSearchParams(
  message: string,
  educationalContext?: EducationalContext | null
): Promise<{ useCase: string | null; productType: string | null; priceMin: number | null; priceMax: number | null; skillLevel: string | null; acknowledgment: string }> {
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Build context hint from educational context if available
    let contextHint = '';
    if (educationalContext) {
      const parts: string[] = [];
      parts.push(`User was learning about "${educationalContext.topic}"`);
      
      if (educationalContext.relatedUseCases?.length) {
        parts.push(`related to use cases: ${educationalContext.relatedUseCases.join(', ')}`);
      }
      
      if (educationalContext.recommendedSensorSizes?.length) {
        parts.push(`Recommended sensor sizes for this use case: ${educationalContext.recommendedSensorSizes.join(', ')}`);
      }
      
      if (educationalContext.recommendedFeatures?.length) {
        parts.push(`Key features discussed: ${educationalContext.recommendedFeatures.join(', ')}`);
      }
      
      contextHint = `\nPrevious educational context: ${parts.join('. ')}.
If the user's message references or follows up on that educational discussion (e.g., mentions "lightweight", "portable", sensor sizes, or says "show me options", "that makes sense", etc.), infer the use_case and product_type from this context.
- If user mentions "lightweight" or "portable" after learning about APS-C/Micro Four Thirds, they want cameras with those sensor sizes.
- Map educational recommendations to search: use the relatedUseCases for use_case, and include sensor preferences in the search.`;
      
      console.log("[SimpleAgent] Using educational context:", JSON.stringify(educationalContext));
    }

    const prompt = `User message: "${message}"
${contextHint}
Extract any use case and price information:`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: extractionSchema,
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");

    const parsed = JSON.parse(text);
    
    // Normalize use_case - handle string "null" or empty strings
    let useCase = parsed.use_case;
    if (!useCase || useCase === "null" || useCase === "Null" || useCase.trim() === "") {
      useCase = null;
    } else {
      useCase = useCase.trim();
    }
    
    // Normalize product_type - handle string "null" or empty strings
    let productType = parsed.product_type;
    if (!productType || productType === "null" || productType === "Null" || productType.trim() === "") {
      productType = null;
    } else {
      productType = productType.trim().toLowerCase();
    }
    
    // Only use positive prices (ignore -1 or negative values)
    const priceMin = (parsed.price_min && parsed.price_min > 0) ? parsed.price_min : null;
    const priceMax = (parsed.price_max && parsed.price_max > 0) ? parsed.price_max : null;
    
    // Normalize skill_level to valid values
    let skillLevel = parsed.skill_level ? parsed.skill_level.toLowerCase().trim() : null;
    if (skillLevel && !['beginner', 'intermediate', 'pro'].includes(skillLevel)) {
      // Try to map common variations
      if (skillLevel.includes('beginner') || skillLevel.includes('new') || skillLevel.includes('start')) {
        skillLevel = 'beginner';
      } else if (skillLevel.includes('pro') || skillLevel.includes('professional') || skillLevel.includes('expert')) {
        skillLevel = 'pro';
      } else if (skillLevel.includes('intermediate') || skillLevel.includes('medium')) {
        skillLevel = 'intermediate';
      } else {
        skillLevel = null; // Invalid value
      }
    }

    return {
      useCase,
      productType,
      priceMin,
      priceMax,
      skillLevel,
      acknowledgment: parsed.acknowledgment || "Got it!",
    };
  } catch (error) {
    console.error("[SimpleAgent] Extraction error:", error);
    return { useCase: null, productType: null, priceMin: null, priceMax: null, skillLevel: null, acknowledgment: "Thanks!" };
  }
}

/**
 * Create initial empty state
 */
export function createInitialState(): CollectedInfo {
  return {
    use_case: null,
    product_type: null,
    price_min: null,
    price_max: null,
    skill_level: null,
    educationalContext: null,
  };
}

/**
 * Main agent function - collects information and asks clarifying questions
 */
export async function processMessage(
  message: string,
  currentInfo: CollectedInfo | null = null
): Promise<SimpleAgentResponse> {
  console.log("[SimpleAgent] Message:", message);
  
  // Start with current info or create new
  const info = currentInfo || createInitialState();
  console.log("[SimpleAgent] Current info:", JSON.stringify(info));

  // Extract new information from user message, passing educational context for inference
  const { useCase, productType, priceMin, priceMax, skillLevel, acknowledgment } = await extractSearchParams(message, info.educationalContext);
  
  // Check if user explicitly said "no budget limit" or wants to increase/remove budget
  const messageLower = message.toLowerCase();
  const noBudgetLimit = messageLower.includes("no budget") || 
                        messageLower.includes("any budget") || 
                        messageLower.includes("budget limit") ||
                        messageLower.includes("price doesn't matter") ||
                        messageLower.includes("increase budget") ||
                        messageLower.includes("show all") ||
                        messageLower.includes("remove budget");
  
  // Update collected info (only update if new value is provided)
  // Normalize use_case - don't set to null if we have a valid existing value
  let finalUseCase = useCase ?? info.use_case;
  if (finalUseCase && (finalUseCase === "null" || finalUseCase === "Null" || finalUseCase.trim() === "")) {
    finalUseCase = null;
  }
  
  // Normalize product_type
  let finalProductType = productType ?? info.product_type;
  if (finalProductType && (finalProductType === "null" || finalProductType === "Null" || finalProductType.trim() === "")) {
    finalProductType = null;
  }
  
  const updatedInfo: CollectedInfo = {
    use_case: finalUseCase,
    product_type: finalProductType,
    // If user says no budget limit or wants to increase budget, clear price filters
    price_min: noBudgetLimit ? null : (priceMin ?? info.price_min),
    price_max: noBudgetLimit ? null : (priceMax ?? info.price_max),
    skill_level: skillLevel ?? info.skill_level,
    // Preserve educational context from previous turns
    educationalContext: info.educationalContext,
  };
  
  console.log("[SimpleAgent] Updated info:", JSON.stringify(updatedInfo));

  // Determine search strategy:
  // - If we have a use_case (especially from educational context), prefer use_case search
  // - Use product_type search when user asks for a product type WITHOUT use_case context
  // - Allow browsing by product type (including cameras) when user explicitly requests it
  const hasUseCaseContext = updatedInfo.use_case || updatedInfo.educationalContext?.relatedUseCases?.length;
  
  // Check if user explicitly wants to browse by product type (e.g., "just cameras", "show me cameras", "I want cameras")
  const explicitProductTypeRequest = updatedInfo.product_type && 
    !hasUseCaseContext &&
    (messageLower.includes('just') || 
     messageLower.includes('show me') || 
     messageLower.includes('i want') ||
     messageLower.includes('find me') ||
     messageLower.includes('browse') ||
     messageLower.includes('for now') || // "Just the camera for now"
     messageLower.includes('only')); // "camera only"
  
  // Allow product type search if:
  // 1. User has product_type AND no use_case context
  // 2. AND either: (a) it's an explicit request, OR (b) it's not a camera (cameras normally need use_case, but allow if explicit)
  const shouldUseProductTypeSearch = updatedInfo.product_type && 
    !hasUseCaseContext && 
    (explicitProductTypeRequest || !['camera', 'cameras'].includes(updatedInfo.product_type.toLowerCase()));
  
  // Check if user is asking for a specific product type WITHOUT use_case context
  if (shouldUseProductTypeSearch) {
    // Search by product type
    console.log("[SimpleAgent] Searching by product type:", updatedInfo.product_type, "price:", updatedInfo.price_min, "-", updatedInfo.price_max);
    
    const searchResult = await searchProductsByType(
      updatedInfo.product_type!, // Safe: checked in shouldUseProductTypeSearch
      updatedInfo.price_min,
      updatedInfo.price_max,
      6
    );

    if (searchResult.products.length === 0) {
      // If we have price filters and no results, try searching without price filters
      if (updatedInfo.price_min || updatedInfo.price_max) {
        console.log("[SimpleAgent] No results with price filter, trying without price filter");
        const searchWithoutPrice = await searchProductsByType(
          updatedInfo.product_type!, // Safe: checked in shouldUseProductTypeSearch
          null,
          null,
          6
        );
        
        if (searchWithoutPrice.products.length > 0) {
          return {
            message: `${acknowledgment} I found ${updatedInfo.product_type}s, but they're outside your budget range. Here are some options:`,
            products: searchWithoutPrice.products,
            collectedInfo: updatedInfo,
            ui: {
              type: "recommendation",
            },
          };
        }
      }
      
      return {
        message: `${acknowledgment} I couldn't find ${updatedInfo.product_type}s matching those criteria. Would you like to adjust your requirements?`,
        products: [],
        collectedInfo: updatedInfo,
        ui: {
          type: "recovery",
          chips: ["Show all products", "Increase budget", "Different product"],
        },
      };
    }

    return {
      message: `${acknowledgment} Here are some ${updatedInfo.product_type}s:`,
      products: searchResult.products,
      collectedInfo: updatedInfo,
      ui: {
        type: "recommendation",
      },
    };
  }

  // If we have product_type but no use_case, try searching by product type as fallback
  // This handles cases like "Just the camera" where user wants to browse without specifying use case
  if (updatedInfo.product_type && !updatedInfo.use_case) {
    console.log("[SimpleAgent] Fallback: Searching by product type without use_case:", updatedInfo.product_type);
    
    const searchResult = await searchProductsByType(
      updatedInfo.product_type,
      updatedInfo.price_min,
      updatedInfo.price_max,
      6
    );

    if (searchResult.products.length > 0) {
      return {
        message: `${acknowledgment} Here are some ${updatedInfo.product_type}s:`,
        products: searchResult.products,
        collectedInfo: updatedInfo,
        ui: {
          type: "recommendation",
        },
      };
    }
    // If no products found, continue to ask for use_case
  }

  // If no product type, continue with use case search
  // Ask clarifying questions if information is missing
  // Priority: 1) use_case (required), 2) price (optional but helpful)
  
  if (!updatedInfo.use_case) {
    return {
      message: `${acknowledgment} What will you primarily use this camera for?`,
      products: [],
      collectedInfo: updatedInfo,
      ui: {
        type: "question",
        chips: ["Travel vlogging", "Studio photography", "Wildlife photography", "Events", "Portrait photography"],
      },
    };
  }

  // If we have use_case but no price, ask for budget (optional but helpful)
  // Skip if user just said "no budget limit"
  if (!updatedInfo.price_min && !updatedInfo.price_max && !noBudgetLimit) {
    return {
      message: `${acknowledgment} Great! For ${updatedInfo.use_case}, what's your budget range? (This helps me find the best options for you)`,
      products: [],
      collectedInfo: updatedInfo,
      ui: {
        type: "question",
        chips: ["Under ₹25,000", "₹25,000 - 50,000", "₹50,000 - 1 Lakh", "Above ₹1 Lakh", "No budget limit"],
      },
    };
  }

  // Validate use_case before searching - ensure it's a valid non-empty string
  const validUseCase = updatedInfo.use_case && 
                       updatedInfo.use_case !== "null" && 
                       updatedInfo.use_case !== "Null" && 
                       updatedInfo.use_case.trim() !== "";
  
  if (!validUseCase) {
    return {
      message: `${acknowledgment} I need to know what you'll use the camera for. What's your primary use case?`,
      products: [],
      collectedInfo: updatedInfo,
      ui: {
        type: "question",
        chips: ["Travel vlogging", "Studio photography", "Wildlife photography", "Events", "Portrait photography"],
      },
    };
  }

  // Clean and normalize use_case
  const cleanUseCase = updatedInfo.use_case.trim();

  // PRIORITY: If we have a specific product_type (like "webcam", "tripod", etc.), 
  // prioritize product_type search over use_case search, especially for non-camera products
  // This handles cases like "video calling" + "webcam" where "video calling" is too generic
  const hasSpecificProductType = updatedInfo.product_type && 
    !['camera', 'cameras'].includes(updatedInfo.product_type.toLowerCase());
  
  if (hasSpecificProductType) {
    console.log("[SimpleAgent] Prioritizing product_type search:", updatedInfo.product_type, "over use_case:", cleanUseCase);
    
    const productTypeSearch = await searchProductsByType(
      updatedInfo.product_type,
      updatedInfo.price_min,
      updatedInfo.price_max,
      6
    );
    
    if (productTypeSearch.products.length > 0) {
      return {
        message: `${acknowledgment} Here are some ${updatedInfo.product_type}s${updatedInfo.use_case ? ` for ${updatedInfo.use_case}` : ''}:`,
        products: productTypeSearch.products,
        collectedInfo: updatedInfo,
        ui: {
          type: "recommendation",
        },
      };
    }
    // If product_type search fails, fall through to use_case search
    console.log("[SimpleAgent] Product type search returned no results, trying use_case search");
  }

  // We have enough information → search products by use_case
  // Note: skill_level is optional - we can search without it, but it helps refine results
  // Get sensor preferences from educational context for filtering
  const sensorKeywords = updatedInfo.educationalContext?.recommendedSensorSizes || null;
  
  console.log("[SimpleAgent] Searching with use_case:", cleanUseCase, "price:", updatedInfo.price_min, "-", updatedInfo.price_max, "skill:", updatedInfo.skill_level, "sensorKeywords:", sensorKeywords);
  
  const searchResult = await searchProducts(
    cleanUseCase,
    updatedInfo.price_min,
    updatedInfo.price_max,
    updatedInfo.skill_level,
    6,
    sensorKeywords
  );

  if (searchResult.products.length === 0) {
    // If use_case search failed and we have a product_type, try product_type search as fallback
    if (updatedInfo.product_type && !hasSpecificProductType) {
      console.log("[SimpleAgent] Use_case search failed, trying product_type search as fallback:", updatedInfo.product_type);
      const productTypeSearch = await searchProductsByType(
        updatedInfo.product_type,
        updatedInfo.price_min,
        updatedInfo.price_max,
        6
      );
      
      if (productTypeSearch.products.length > 0) {
        return {
          message: `${acknowledgment} Here are some ${updatedInfo.product_type}s:`,
          products: productTypeSearch.products,
          collectedInfo: updatedInfo,
          ui: {
            type: "recommendation",
          },
        };
      }
    }
    
    // If we have price filters and no results, try searching without price filters
    if (updatedInfo.price_min || updatedInfo.price_max) {
      console.log("[SimpleAgent] No results with price filter, trying without price filter");
      const searchWithoutPrice = await searchProducts(
        cleanUseCase,
        null, // Remove price filters
        null,
        updatedInfo.skill_level,
        6,
        sensorKeywords
      );
      
      if (searchWithoutPrice.products.length > 0) {
        // Check if these are approximate matches
        if (!searchWithoutPrice.hasExactMatches) {
          // Get unique matched use cases from products
          const matchedUseCases = new Set<string>();
          searchWithoutPrice.products.forEach(p => {
            p.matchedUseCases.forEach(uc => {
              // Convert underscores to spaces for display
              matchedUseCases.add(uc.replace(/_/g, ' '));
            });
          });
          const useCaseList = Array.from(matchedUseCases).slice(0, 3).join(', ');
          
          return {
            message: `${acknowledgment} We couldn't find exact matches for "${cleanUseCase}", but here are the closest products we have. These products match because they're designed for ${useCaseList || 'similar use cases'} which are similar to your needs. However, they're outside your budget range. Here are some options:`,
            products: searchWithoutPrice.products,
            collectedInfo: updatedInfo,
            ui: {
              type: "recommendation",
            },
          };
        }
        
        return {
          message: `${acknowledgment} I found products for ${cleanUseCase}, but they're outside your budget range. Here are some options:`,
          products: searchWithoutPrice.products,
          collectedInfo: updatedInfo,
          ui: {
            type: "recommendation",
          },
        };
      }
    }
    
    return {
      message: `${acknowledgment} I couldn't find products matching those criteria. Would you like to adjust your requirements?`,
      products: [],
      collectedInfo: updatedInfo,
      ui: {
        type: "recovery",
        chips: ["Show all cameras", "Increase budget", "Different use case"],
      },
    };
  }

  // Check if we have exact matches or approximate matches
  if (!searchResult.hasExactMatches) {
    // Get unique matched use cases from products
    const matchedUseCases = new Set<string>();
    searchResult.products.forEach(p => {
      p.matchedUseCases.forEach(uc => {
        // Convert underscores to spaces for display
        matchedUseCases.add(uc.replace(/_/g, ' '));
      });
    });
    const useCaseList = Array.from(matchedUseCases).slice(0, 3).join(', ');
    
    // Generate explanation based on match type
    let explanation = '';
    if (searchResult.bestMatchType === 'word_based') {
      explanation = `We found products that match some keywords from your search. These products are designed for ${useCaseList || 'related use cases'} which are similar to your needs.`;
    } else if (searchResult.bestMatchType === 'semantic') {
      explanation = `We found products with similar use cases. These products are designed for ${useCaseList || 'related purposes'} which are similar to your needs.`;
    } else {
      explanation = `We found the closest matching products. These products are designed for ${useCaseList || 'related use cases'} which are similar to your needs.`;
    }
    
    return {
      message: `${acknowledgment} We couldn't find exact matches for "${cleanUseCase}", but here are the closest products we have. ${explanation}`,
      products: searchResult.products,
      collectedInfo: updatedInfo,
      ui: {
        type: "recommendation",
      },
    };
  }

  // Exact matches found
  return {
    message: `${acknowledgment} Here are some great options for ${updatedInfo.use_case}:`,
    products: searchResult.products,
    collectedInfo: updatedInfo,
    ui: {
      type: "recommendation",
    },
  };
}
