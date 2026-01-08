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
        <div className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          {title}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product, idx) => (
          <a
            key={product.id + idx}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-elevated transition-all duration-200"
          >
            <div className="relative aspect-[4/3] bg-muted">
              <Image
                src={product.image.url}
                alt={product.image.altText || product.title}
                fill
                className="object-cover group-hover:scale-102 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.src = "/placeholder-product.svg";
                }}
              />
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-card/95 backdrop-blur-sm text-foreground text-sm font-semibold border border-border">
                {formatPrice(product.price.amount)}
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-foreground font-medium text-[15px] line-clamp-2 group-hover:text-primary transition-colors">
                {product.title}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {product.vendor && <span className="truncate max-w-[60%]">{product.vendor}</span>}
                {product.productType && (
                  <span className="px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground">
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
