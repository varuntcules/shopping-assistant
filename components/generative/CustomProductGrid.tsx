"use client";

import { ProductCard } from "@/lib/types";
import Image from "next/image";

interface CustomProductGridProps {
  title?: string;
  products: ProductCard[];
}

function formatPrice(amount: string): string {
  const num = parseFloat(amount);
  return `₹${num.toLocaleString("en-IN")}`;
}

export function CustomProductGrid({ title, products }: CustomProductGridProps) {
  if (!products || products.length === 0) return null;

  return (
    <div className="space-y-3">
      {title && (
        <div className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-1 h-6 bg-gradient-to-b from-violet-400 to-fuchsia-500 rounded-full" />
          {title}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product, idx) => (
          <a
            key={product.id + idx}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden hover:border-violet-400/40 hover:-translate-y-1 transition"
          >
            <div className="relative aspect-square bg-slate-900/80">
              <Image
                src={product.image.url}
                alt={product.image.altText || product.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.src = "/placeholder-product.svg";
                }}
              />
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/70 text-white text-sm font-semibold">
                {formatPrice(product.price.amount)}
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-white font-medium line-clamp-2 group-hover:text-violet-200 transition">
                {product.title}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                {product.vendor && <span className="truncate max-w-[60%]">{product.vendor}</span>}
                {product.productType && (
                  <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                    {product.productType}
                  </span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}


