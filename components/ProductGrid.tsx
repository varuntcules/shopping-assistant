"use client";

import { ProductCard } from "@/lib/types";
import Image from "next/image";
import { useState } from "react";

interface ProductGridProps {
  products: ProductCard[];
  title?: string;
}

function formatPrice(amount: string): string {
  const num = parseFloat(amount);
  // Always display in INR
  return `₹${num.toLocaleString("en-IN")}`;
}

function ProductImage({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  const [imageSrc, setImageSrc] = useState(
    src && src !== "/placeholder-product.svg" ? src : "/placeholder-product.svg"
  );

  return (
    <Image
      src={imageSrc}
      alt={alt}
      fill
      className="object-cover group-hover:scale-105 transition-transform duration-500"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      onError={() => setImageSrc("/placeholder-product.svg")}
    />
  );
}

export default function ProductGrid({ products, title }: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
          <span className="w-1 h-6 bg-gradient-to-b from-violet-400 to-fuchsia-500 rounded-full" />
          {title}
        </h3>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {products.map((product, index) => (
          <a
            key={product.id}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden
                       hover:bg-white/10 hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/10
                       transition-all duration-300 ease-out hover:-translate-y-1"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Product Image */}
            <div className="relative aspect-square bg-gradient-to-br from-slate-800 to-slate-900 overflow-hidden">
              <ProductImage
                src={product.image.url}
                alt={product.image.altText || product.title}
              />
              
              {/* Price badge */}
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white text-sm font-bold px-3 py-1.5 rounded-full">
                {formatPrice(product.price.amount)}
              </div>
            </div>
            
            {/* Product Info */}
            <div className="p-4 space-y-2">
              <h4 className="font-medium text-white line-clamp-2 group-hover:text-violet-300 transition-colors">
                {product.title}
              </h4>
              
              <div className="flex items-center justify-between text-sm">
                {product.vendor && (
                  <span className="text-violet-400/80 truncate max-w-[60%]">
                    {product.vendor}
                  </span>
                )}
                {product.productType && (
                  <span className="text-slate-400 text-xs bg-white/5 px-2 py-1 rounded-full truncate max-w-[40%]">
                    {product.productType}
                  </span>
                )}
              </div>
              
              {/* View button overlay */}
              <div className="absolute inset-x-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-center py-2 rounded-lg text-sm font-medium shadow-lg">
                  View Product →
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
