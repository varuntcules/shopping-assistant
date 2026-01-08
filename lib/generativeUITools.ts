import { z } from "zod";
import { type ProductCard, type GeneratedUIBlock } from "./types";
import { type CollectedInfo, createInitialState } from "./simpleAgent";

type ToolReturn = { uiBlock: GeneratedUIBlock };
type ToolReturnWithState = { uiBlock: GeneratedUIBlock; collectedInfo: CollectedInfo };

function mapProductsToCards(raw: Array<any>): ProductCard[] {
  return raw.map((p, idx) => ({
    id: String(p.id ?? p.productId ?? p.handle ?? idx),
    title: p.title ?? "Product",
    handle: p.handle ?? "",
    vendor: p.vendor ?? "Store",
    productType: p.productType ?? p.category ?? "product",
    price: {
      amount: String(p.price ?? p.price_min ?? p.price_max ?? 0),
      currencyCode: p.currencyCode ?? "INR",
    },
    image: {
      url: p.imageUrl || p.image?.url || "/placeholder-product.svg",
      altText: p.image?.altText ?? p.title ?? "Product image",
    },
    url: p.url ?? `#product-${p.id ?? p.handle ?? idx}`,
  }));
}

export function getGenerativeUITools(priorCollected: CollectedInfo | null = null) {
  const currentState = priorCollected || createInitialState();
  
  return {
    show_product_grid: {
      description:
        "Render a grid of products. Use after fetching products. Keep to 4-8 items for clarity.",
      parameters: z.object({
        title: z.string().optional(),
        products: z
          .array(
            z.object({
              id: z.string().optional(),
              productId: z.union([z.string(), z.number()]).optional(),
              variantId: z.union([z.string(), z.number()]).optional(),
              title: z.string(),
              handle: z.string().optional(),
              vendor: z.string().optional(),
              productType: z.string().optional(),
              price: z.union([z.number(), z.string()]).optional(),
              price_min: z.union([z.number(), z.string()]).optional(),
              price_max: z.union([z.number(), z.string()]).optional(),
              currencyCode: z.string().optional(),
              imageUrl: z.string().optional(),
              image: z
                .object({
                  url: z.string().optional(),
                  altText: z.string().optional(),
                })
                .optional(),
              url: z.string().optional(),
            })
          )
          .min(1),
      }),
      execute: async ({
        title,
        products,
      }: {
        title?: string;
        products: any[];
      }): Promise<ToolReturn> => {
        return {
          uiBlock: {
            kind: "productGrid",
            title,
            products: mapProductsToCards(products),
          },
        };
      },
    },

    show_product_comparison: {
      description:
        "Show a side-by-side comparison of 2-4 products with specs/pros/cons. Use after fetching products.",
      parameters: z.object({
        summary: z.string().optional(),
        items: z
          .array(
            z.object({
              title: z.string(),
              price: z.string().optional(),
              imageUrl: z.string().optional(),
              badges: z.array(z.string()).optional(),
              specs: z.record(z.string(), z.string()).optional(),
              pros: z.array(z.string()).optional(),
              cons: z.array(z.string()).optional(),
            })
          )
          .min(2)
          .max(4),
      }),
      execute: async ({
        items,
        summary,
      }: {
        items: any[];
        summary?: string;
      }): Promise<ToolReturn> => {
        return {
          uiBlock: {
            kind: "comparison",
            items,
            summary,
          },
        };
      },
    },

    show_educational_content: {
      description:
        "Explain a concept in depth (e.g., sensor size, lens basics, low light performance). Provide rich educational content with detailed explanations, not just tips. Use 'body' for main explanation text, 'sections' for structured breakdowns (e.g., Full-Frame vs APS-C vs Micro Four Thirds), and 'bullets' for key takeaways. This pauses the shopping flow to educate the user. IMPORTANT: Always include relatedUseCases AND recommendedSensorSizes/recommendedFeatures when applicable to preserve context for follow-up queries.",
      parameters: z.object({
        title: z.string().describe("Clear educational title (e.g., 'Understanding Sensor Size for Low Light Photography')"),
        body: z.string().optional().describe("Main explanatory text explaining the concept in detail. Use markdown-style formatting with **bold** for emphasis."),
        sections: z.array(z.object({
          title: z.string().describe("Section heading (e.g., 'Full-Frame Sensors')"),
          description: z.string().describe("Detailed explanation of this section"),
        })).optional().describe("Structured breakdown of the concept (e.g., different sensor sizes with explanations)"),
        bullets: z.array(z.string()).optional().describe("Key takeaways or summary points"),
        relatedUseCases: z.array(z.string()).optional().describe("Use cases this education relates to (e.g., ['travel vlogging', 'low light photography']). This helps carry context forward when user follows up."),
        recommendedSensorSizes: z.array(z.string()).optional().describe("If discussing sensor sizes, list the recommended ones for the use case (e.g., ['APS-C', 'Micro Four Thirds'] for travel vlogging, ['Full-Frame'] for studio work)."),
        recommendedFeatures: z.array(z.string()).optional().describe("Key features/attributes recommended for the use case (e.g., ['lightweight', 'portable', 'weather-sealed', 'good autofocus'])."),
      }),
      execute: async ({
        title,
        body,
        sections,
        bullets,
        relatedUseCases,
        recommendedSensorSizes,
        recommendedFeatures,
      }: {
        title?: string;
        body?: string;
        sections?: Array<{ title: string; description: string }>;
        bullets?: string[];
        relatedUseCases?: string[];
        recommendedSensorSizes?: string[];
        recommendedFeatures?: string[];
      }): Promise<ToolReturnWithState> => {
        // Update collected info with educational context including recommendations
        const updatedState: CollectedInfo = {
          ...currentState,
          educationalContext: {
            topic: title || "general",
            relatedUseCases: relatedUseCases || [],
            recommendedSensorSizes: recommendedSensorSizes || [],
            recommendedFeatures: recommendedFeatures || [],
            keyTakeaways: bullets || [],
            timestamp: Date.now(),
          },
        };
        
        console.log("[EducationalContent] Storing context:", {
          topic: title,
          relatedUseCases,
          recommendedSensorSizes,
          recommendedFeatures,
          educationalContext: updatedState.educationalContext,
        });
        
        return {
          uiBlock: {
            kind: "education",
            title,
            body,
            sections,
            bullets,
          },
          collectedInfo: updatedState,
        };
      },
    },

    show_interactive_filters: {
      description:
        "Render interactive filters to refine search. Use chips for categorical filters and ranges for budgets.",
      parameters: z.object({
        heading: z.string().optional(),
        chips: z.array(z.string()).optional(),
        ranges: z
          .array(
            z.object({
              label: z.string(),
              min: z.number().optional(),
              max: z.number().optional(),
            })
          )
          .optional(),
      }),
      execute: async ({
        heading,
        chips,
        ranges,
      }: {
        heading?: string;
        chips?: string[];
        ranges?: Array<{ label: string; min?: number; max?: number }>;
      }): Promise<ToolReturn> => {
        return {
          uiBlock: {
            kind: "filters",
            heading,
            chips,
            ranges,
          },
        };
      },
    },

    ask_clarifying_question: {
      description:
        "Ask a clarifying question with quick chips. Use when key info (use case, budget, product type) is missing.",
      parameters: z.object({
        prompt: z.string(),
        chips: z.array(z.string()).optional(),
      }),
      execute: async ({ prompt, chips }: { prompt: string; chips?: string[] }): Promise<ToolReturn> => {
        return {
          uiBlock: {
            kind: "question",
            prompt,
            chips,
          },
        };
      },
    },
  };
}

