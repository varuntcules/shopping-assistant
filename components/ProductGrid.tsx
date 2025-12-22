"use client";

import { ProductCard } from "@/lib/types";
import Image from "next/image";

interface ProductGridProps {
  products: ProductCard[];
  title?: string;
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
              {product.image.url && product.image.url !== "/placeholder-product.png" ? (
                <Image
                  src={product.image.url}
                  alt={product.image.altText || product.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-16 h-16 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              
              {/* Price badge */}
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white text-sm font-bold px-3 py-1.5 rounded-full">
                {formatPrice(product.price.amount, product.price.currencyCode)}
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

