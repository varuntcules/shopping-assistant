"use client";

import { ProductCard } from "@/lib/types";
import Image from "next/image";

interface BentoProductGridProps {
  products: ProductCard[];
  onProductClick?: (product: ProductCard) => void;
  highlightedIndex?: number;
}

// Calculate match percentage based on index (97%, 83%, 70%, 68%, 65%)
function getMatchPercentage(index: number): number {
  const percentages = [97, 83, 70, 68, 65];
  return percentages[index] || 65;
}

// Get badge color based on percentage
function getBadgeColor(percentage: number): string {
  if (percentage >= 95) return "#3ba0ff"; // Bright blue
  if (percentage >= 80) return "#61a9ed"; // Lighter blue
  if (percentage >= 70) return "#70ace5"; // Medium blue
  if (percentage >= 65) return "#8bbbe8"; // Lighter blue
  return "#b2b2b2"; // Grey
}

// Format price
function formatPrice(amount: string, currencyCode: string): string {
  const num = parseFloat(amount);
  if (currencyCode === "INR") {
    return `₹${num.toLocaleString("en-IN")}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(num);
}

export default function BentoProductGrid({ 
  products, 
  onProductClick,
  highlightedIndex
}: BentoProductGridProps) {
  if (!products || products.length === 0) return null;

  // Ensure we have exactly 5 products
  const displayProducts = products.slice(0, 5);
  
  // Layout: 
  // Row 1: [Card 0 (tall)] + [Card 1 (small), Card 2 (small)]
  // Row 2: [Card 3 (medium)], [Card 4 (medium)]

  return (
    <div className="w-full h-full flex flex-col" style={{ paddingLeft: "20px", paddingRight: "20px", width: "100%" }}>
      <div className="flex flex-col flex-1 w-full" style={{ gap: "12px", minHeight: 0, height: "100%" }}>
        {/* First Row */}
        <div className="flex flex-1 w-full" style={{ gap: "12px", minHeight: 0, height: "100%" }}>
          {/* Left: Tall card (Card 0) */}
          <div 
            className="bg-[#1b1b1b] rounded-[8px] flex flex-col relative cursor-pointer transition-all duration-200 hover:opacity-90 h-full flex-shrink-0"
            style={{ width: "201px", padding: "8px", gap: "12px" }}
            onClick={() => onProductClick?.(displayProducts[0])}
          >
            <div className="flex-1 flex flex-col relative overflow-hidden" style={{ gap: "8px" }}>
              {/* Product Image */}
              <div className="flex-1 relative overflow-hidden">
                {displayProducts[0]?.image.url && displayProducts[0].image.url !== "/placeholder-product.png" ? (
                  <Image
                    src={displayProducts[0].image.url}
                    alt={displayProducts[0].image.altText || displayProducts[0].title}
                    fill
                    className="object-contain"
                    sizes="201px"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Product Title */}
              <div style={{ padding: "8px", height: "54px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p className="text-[18px] font-medium text-white leading-none tracking-[-0.72px]">
                  {displayProducts[0]?.title || ""}
                </p>
              </div>
              
              {/* Price Badge - Right side */}
              {displayProducts[0] && (
                <div 
                  className="absolute"
                  style={{ 
                    right: "46px", 
                    top: "6px", 
                    transform: "translateX(100%) translateY(-50%)"
                  }}
                >
                  <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px] whitespace-nowrap">
                    {formatPrice(displayProducts[0].price.amount, displayProducts[0].price.currencyCode)}
                  </p>
                </div>
              )}
            </div>
            
            {/* Percentage Badge */}
            {displayProducts[0] && (
              <div 
                className="absolute rounded-[6px]"
                style={{ 
                  left: "8px", 
                  top: "8px", 
                  paddingLeft: "4px", 
                  paddingRight: "4px", 
                  paddingTop: "3px", 
                  paddingBottom: "3px",
                  backgroundColor: getBadgeColor(getMatchPercentage(0)) 
                }}
              >
                <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px]">
                  {getMatchPercentage(0)}%
                </p>
              </div>
            )}
          </div>

          {/* Right: Two stacked cards (Card 1, Card 2) */}
          <div className="flex flex-col flex-1 h-full min-w-0" style={{ gap: "12px", minHeight: 0 }}>
            {/* Top small card (Card 1) */}
            <div 
              className="bg-[#1b1b1b] rounded-[8px] flex flex-col relative cursor-pointer transition-all duration-200 hover:opacity-90 flex-1 min-w-0"
              style={{ padding: "8px", gap: "12px", minHeight: 0 }}
              onClick={() => onProductClick?.(displayProducts[1])}
            >
              <div className="flex flex-col" style={{ gap: "8px" }}>
                {/* Product Image */}
                <div className="relative" style={{ aspectRatio: "112/87" }}>
                  {displayProducts[1]?.image.url && displayProducts[1].image.url !== "/placeholder-product.png" ? (
                    <Image
                      src={displayProducts[1].image.url}
                      alt={displayProducts[1].image.altText || displayProducts[1].title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 180px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                
                {/* Product Title */}
                <div style={{ paddingLeft: "8px", paddingRight: "8px", paddingTop: "4px", paddingBottom: "4px" }}>
                  <p className="text-[13px] font-medium text-white leading-none tracking-[-0.52px]" style={{ height: "27px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {displayProducts[1]?.title || ""}
                  </p>
                </div>
                
                {/* Price Badge - Right side */}
                {displayProducts[1] && (
                  <div 
                    className="absolute"
                    style={{ 
                      right: "46px", 
                      top: "6px", 
                      transform: "translateX(100%) translateY(-50%)"
                    }}
                  >
                    <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px] whitespace-nowrap">
                      {formatPrice(displayProducts[1].price.amount, displayProducts[1].price.currencyCode)}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Percentage Badge */}
              {displayProducts[1] && (
                <div 
                  className="absolute rounded-[6px]"
                  style={{ 
                    left: "8px", 
                    top: "8px", 
                    paddingLeft: "4px", 
                    paddingRight: "4px", 
                    paddingTop: "3px", 
                    paddingBottom: "3px",
                    backgroundColor: getBadgeColor(getMatchPercentage(1)) 
                  }}
                >
                  <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px]">
                    {getMatchPercentage(1)}%
                  </p>
                </div>
              )}
            </div>

            {/* Bottom small card (Card 2) */}
            <div 
              className="bg-[#1b1b1b] rounded-[8px] flex flex-col relative cursor-pointer transition-all duration-200 hover:opacity-90 flex-1 min-w-0"
              style={{ padding: "8px", gap: "12px", minHeight: 0 }}
              onClick={() => onProductClick?.(displayProducts[2])}
            >
              <div className="flex-1 flex flex-col relative overflow-hidden" style={{ gap: "8px" }}>
                {/* Product Image */}
                <div className="flex-1 relative overflow-hidden">
                  {displayProducts[2]?.image.url && displayProducts[2].image.url !== "/placeholder-product.png" ? (
                    <Image
                      src={displayProducts[2].image.url}
                      alt={displayProducts[2].image.altText || displayProducts[2].title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 180px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                
                {/* Product Title */}
                <div style={{ paddingLeft: "8px", paddingRight: "8px", paddingTop: "4px", paddingBottom: "4px" }}>
                  <p className="text-[13px] font-medium text-white leading-none tracking-[-0.52px]" style={{ height: "27px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {displayProducts[2]?.title || ""}
                  </p>
                </div>
              </div>
              
              {/* Price Badge - Right side */}
              {displayProducts[2] && (
                <div 
                  className="absolute"
                  style={{ 
                    right: "54px", 
                    top: "13.53px", 
                    transform: "translateX(100%) translateY(-50%)"
                  }}
                >
                  <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px] whitespace-nowrap">
                    {formatPrice(displayProducts[2].price.amount, displayProducts[2].price.currencyCode)}
                  </p>
                </div>
              )}
              
              {/* Percentage Badge */}
              {displayProducts[2] && (
                <div 
                  className="absolute rounded-[6px]"
                  style={{ 
                    left: "8px", 
                    top: "8.46px", 
                    paddingLeft: "4px", 
                    paddingRight: "4px", 
                    paddingTop: "3px", 
                    paddingBottom: "3px",
                    backgroundColor: getBadgeColor(getMatchPercentage(2)) 
                  }}
                >
                  <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px]">
                    {getMatchPercentage(2)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Second Row: Two equal cards (Card 3, Card 4) */}
        <div className="flex w-full" style={{ gap: "12px", height: "140px" }}>
          {/* Left card (Card 3) */}
          <div 
            className="bg-[#1b1b1b] rounded-[8px] flex flex-col relative cursor-pointer transition-all duration-200 hover:opacity-90 flex-1 min-w-0"
            style={{ padding: "8px", gap: "12px" }}
            onClick={() => onProductClick?.(displayProducts[3])}
          >
            <div className="flex-1 flex flex-col relative overflow-hidden" style={{ gap: "8px" }}>
              {/* Product Image */}
              <div className="flex-1 relative overflow-hidden">
                {displayProducts[3]?.image.url && displayProducts[3].image.url !== "/placeholder-product.png" ? (
                  <Image
                    src={displayProducts[3].image.url}
                    alt={displayProducts[3].image.altText || displayProducts[3].title}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 50vw, 180px"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Product Title */}
              <div style={{ paddingLeft: "8px", paddingRight: "8px", paddingTop: "4px", paddingBottom: "4px" }}>
                <p className="text-[13px] font-medium text-white leading-none tracking-[-0.52px]" style={{ height: "27px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {displayProducts[3]?.title || ""}
                </p>
              </div>
            </div>
            
            {/* Price Badge - Right side */}
            {displayProducts[3] && (
              <div 
                className="absolute"
                style={{ 
                  right: "55.5px", 
                  top: "13.07px", 
                  transform: "translateX(100%) translateY(-50%)"
                }}
              >
                <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px] whitespace-nowrap">
                  {formatPrice(displayProducts[3].price.amount, displayProducts[3].price.currencyCode)}
                </p>
              </div>
            )}
            
            {/* Percentage Badge */}
            {displayProducts[3] && (
              <div 
                className="absolute rounded-[6px]"
                style={{ 
                  left: "8px", 
                  top: "8.46px", 
                  paddingLeft: "4px", 
                  paddingRight: "4px", 
                  paddingTop: "3px", 
                  paddingBottom: "3px",
                  backgroundColor: getBadgeColor(getMatchPercentage(3)) 
                }}
              >
                <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px]">
                  {getMatchPercentage(3)}%
                </p>
              </div>
            )}
          </div>

          {/* Right card (Card 4) */}
          <div 
            className="bg-[#1b1b1b] rounded-[8px] flex flex-col relative cursor-pointer transition-all duration-200 hover:opacity-90 flex-1 min-w-0"
            style={{ padding: "8px", gap: "12px" }}
            onClick={() => onProductClick?.(displayProducts[4])}
          >
            <div className="flex-1 flex flex-col relative overflow-hidden" style={{ gap: "8px" }}>
              {/* Product Image */}
              <div className="flex-1 relative overflow-hidden">
                {displayProducts[4]?.image.url && displayProducts[4].image.url !== "/placeholder-product.png" ? (
                  <Image
                    src={displayProducts[4].image.url}
                    alt={displayProducts[4].image.altText || displayProducts[4].title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 180px"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Product Title */}
              <div style={{ paddingLeft: "8px", paddingRight: "8px", paddingTop: "4px", paddingBottom: "4px" }}>
                <p className="text-[13px] font-medium text-white leading-none tracking-[-0.52px]" style={{ height: "27px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {displayProducts[4]?.title || ""}
                </p>
              </div>
            </div>
            
            {/* Price Badge - Right side */}
            {displayProducts[4] && (
              <div 
                className="absolute"
                style={{ 
                  right: "47px", 
                  top: "5.07px", 
                  transform: "translateX(100%) translateY(-50%)"
                }}
              >
                <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px] whitespace-nowrap">
                  {formatPrice(displayProducts[4].price.amount, displayProducts[4].price.currencyCode)}
                </p>
              </div>
            )}
            
            {/* Percentage Badge */}
            {displayProducts[4] && (
              <div 
                className="absolute rounded-[6px]"
                style={{ 
                  left: "8px", 
                  top: "8px", 
                  paddingLeft: "4px", 
                  paddingRight: "4px", 
                  paddingTop: "3px", 
                  paddingBottom: "3px",
                  backgroundColor: getBadgeColor(getMatchPercentage(4)) 
                }}
              >
                <p className="text-[12px] font-semibold text-white leading-none tracking-[0.48px]">
                  {getMatchPercentage(4)}%
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

