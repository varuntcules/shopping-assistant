"use client";

import { ProductCard } from "@/lib/types";
import Image from "next/image";
import { useEffect, useRef } from "react";

interface HorizontalProductGridProps {
  products: ProductCard[];
  onProductClick?: (product: ProductCard) => void;
  highlightedIndex?: number;
}

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

export default function HorizontalProductGrid({ 
  products, 
  onProductClick,
  highlightedIndex
}: HorizontalProductGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll to highlighted product
  useEffect(() => {
    if (highlightedIndex !== undefined && highlightedIndex >= 0 && highlightedIndex < products.length) {
      const card = cardRefs.current[highlightedIndex];
      const container = containerRef.current;
      
      if (card && container) {
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
          const cardRect = card.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const cardLeft = card.offsetLeft;
          const cardWidth = card.offsetWidth;
          const containerWidth = container.offsetWidth;
          const containerScrollLeft = container.scrollLeft;
          
          // Calculate scroll position to center the card
          const cardCenter = cardLeft + (cardWidth / 2);
          const containerCenter = containerScrollLeft + (containerWidth / 2);
          const scrollOffset = cardCenter - containerCenter;
          
          container.scrollTo({
            left: containerScrollLeft + scrollOffset,
            behavior: 'smooth'
          });
        });
      }
    }
  }, [highlightedIndex, products.length]);

  if (!products || products.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className="w-full overflow-x-auto snap-x snap-mandatory pb-4 scroll-smooth"
      style={{ 
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
        scrollPaddingLeft: 'calc(50% - 100px)',
        scrollPaddingRight: 'calc(50% - 100px)',
      }}
    >
      <div className="flex gap-4" style={{ paddingLeft: 'calc(50% - 100px)', paddingRight: 'calc(50% - 100px)' }}>
        {products.map((product, index) => {
          const isHighlighted = highlightedIndex === index;
          
          return (
            <div
              key={product.id}
              ref={(el) => { cardRefs.current[index] = el; }}
              className={`
                flex-shrink-0 w-[200px] h-[280px]
                bg-white rounded-2xl shadow-lg
                snap-center
                flex flex-col overflow-hidden
                cursor-pointer transition-all duration-300
                ${isHighlighted 
                  ? "scale-110 border-2 border-red-500 shadow-xl shadow-red-500/30 z-10" 
                  : "scale-100 border border-transparent hover:scale-[1.02] hover:border-red-400"
                }
              `}
              onClick={() => onProductClick?.(product)}
            >
            {/* Product Image */}
            <div className="relative flex-1 bg-gray-100 flex items-center justify-center overflow-hidden">
              {product.image.url && product.image.url !== "/placeholder-product.png" ? (
                <Image
                  src={product.image.url}
                  alt={product.image.altText || product.title}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 50vw, 200px"
                />
              ) : (
                <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              
              {/* Price badge */}
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white text-sm font-bold px-3 py-1.5 rounded-full">
                {formatPrice(product.price.amount, product.price.currencyCode)}
              </div>
            </div>
            
            {/* Product Info */}
            <div className="p-3 text-center">
              <h4 className="font-medium text-gray-800 text-sm line-clamp-2">
                {product.title}
              </h4>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

