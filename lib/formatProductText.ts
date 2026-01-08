/**
 * Format Product Text for TTS
 * 
 * Converts product data into natural, conversational text for text-to-speech.
 * All prices are assumed to be in INR (rupees).
 */

import { ChatMessage, ProductCard, GeneratedUIBlock } from "./types";

/**
 * Format a price amount to spoken text in INR
 */
function formatPrice(amount: string): string {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return "price not available";
  }
  
  // Format with Indian number system (lakhs, crores)
  if (numAmount >= 10000000) {
    // Crores
    const crores = Math.floor(numAmount / 10000000);
    const remainder = numAmount % 10000000;
    if (remainder >= 100000) {
      const lakhs = Math.floor(remainder / 100000);
      return `${crores} crore ${lakhs} lakh rupees`;
    }
    return `${crores} crore rupees`;
  } else if (numAmount >= 100000) {
    // Lakhs
    const lakhs = Math.floor(numAmount / 100000);
    const remainder = numAmount % 100000;
    if (remainder >= 1000) {
      const thousands = Math.floor(remainder / 1000);
      return `${lakhs} lakh ${thousands} thousand rupees`;
    }
    return `${lakhs} lakh rupees`;
  } else if (numAmount >= 1000) {
    // Thousands
    const thousands = Math.floor(numAmount / 1000);
    const remainder = numAmount % 1000;
    if (remainder > 0) {
      return `${thousands} thousand ${Math.floor(remainder)} rupees`;
    }
    return `${thousands} thousand rupees`;
  } else {
    return `${Math.floor(numAmount)} rupees`;
  }
}

/**
 * Format product recommendations into spoken text
 */
function formatProducts(products: ProductCard[]): string {
  if (!products || products.length === 0) {
    return "";
  }

  if (products.length === 1) {
    const product = products[0];
    const priceText = formatPrice(product.price.amount);
    return `I found ${product.title} at ${priceText}.`;
  }

  const parts: string[] = [];
  parts.push(`I found ${products.length} products that match your needs.`);

  // Limit to first 5 products to avoid overly long speech
  const productsToSpeak = products.slice(0, 5);
  
  productsToSpeak.forEach((product, index) => {
    const priceText = formatPrice(product.price.amount);
    const ordinal = index === 0 ? "First" : index === 1 ? "Second" : index === 2 ? "Third" : index === 3 ? "Fourth" : "Fifth";
    parts.push(`${ordinal}, ${product.title} at ${priceText}.`);
  });

  if (products.length > 5) {
    parts.push(`And ${products.length - 5} more options are available.`);
  }

  return parts.join(" ");
}

/**
 * Format comparison block into spoken text
 */
function formatComparison(block: Extract<GeneratedUIBlock, { kind: "comparison" }>): string {
  const parts: string[] = [];
  
  if (block.summary) {
    parts.push(block.summary);
  }

  if (block.items && block.items.length >= 2) {
    parts.push("Comparing your options:");
    
    block.items.slice(0, 3).forEach((item, index) => {
      const ordinal = index === 0 ? "First" : index === 1 ? "Second" : "Third";
      const priceText = item.price ? formatPrice(item.price) : "";
      const pricePart = priceText ? ` at ${priceText}` : "";
      
      let itemText = `${ordinal}, ${item.title}${pricePart}.`;
      
      if (item.pros && item.pros.length > 0) {
        itemText += ` It's great for ${item.pros[0]}.`;
      }
      
      parts.push(itemText);
    });
  }

  return parts.join(" ");
}

/**
 * Format product grid block into spoken text
 */
function formatProductGrid(block: Extract<GeneratedUIBlock, { kind: "productGrid" }>): string {
  if (!block.products || block.products.length === 0) {
    return "";
  }
  return formatProducts(block.products);
}

/**
 * Format education block into spoken text (if relevant)
 */
function formatEducation(block: Extract<GeneratedUIBlock, { kind: "education" }>): string {
  const parts: string[] = [];
  
  if (block.title) {
    parts.push(block.title);
  }
  
  if (block.body) {
    parts.push(block.body);
  }
  
  // Include key bullets if available
  if (block.bullets && block.bullets.length > 0) {
    const keyBullets = block.bullets.slice(0, 3).join(". ");
    parts.push(keyBullets);
  }
  
  return parts.join(". ");
}

/**
 * Format a complete chat message into spoken text for TTS
 */
export function formatMessageForTTS(message: ChatMessage): string {
  if (message.role !== "assistant") {
    return ""; // Only speak assistant messages
  }

  const parts: string[] = [];

  // Start with the main content
  if (message.content && message.content.trim()) {
    parts.push(message.content.trim());
  }

  // Add product information from products array
  if (message.products && message.products.length > 0) {
    const productText = formatProducts(message.products);
    if (productText) {
      parts.push(productText);
    }
  }

  // Add information from generated UI blocks
  if (message.generatedUI && message.generatedUI.length > 0) {
    for (const block of message.generatedUI) {
      switch (block.kind) {
        case "productGrid":
          const gridText = formatProductGrid(block);
          if (gridText) {
            parts.push(gridText);
          }
          break;
        case "comparison":
          const comparisonText = formatComparison(block);
          if (comparisonText) {
            parts.push(comparisonText);
          }
          break;
        case "education":
          // Only include education if there are no products (to avoid redundancy)
          if (!message.products || message.products.length === 0) {
            const educationText = formatEducation(block);
            if (educationText) {
              parts.push(educationText);
            }
          }
          break;
        // Skip filters and questions - these are interactive UI elements
        case "filters":
        case "question":
          break;
      }
    }
  }

  // Join all parts with natural pauses
  return parts.filter(p => p.trim()).join(". ");
}
