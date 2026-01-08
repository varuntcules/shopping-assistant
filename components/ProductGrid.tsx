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
      className="object-cover group-hover:scale-102 transition-transform duration-300"
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
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          {title}
        </h3>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product, index) => (
          <a
            key={`${product.id}-${index}`}
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-card border border-border rounded-xl overflow-hidden
                       hover:border-primary/30 hover:shadow-elevated
                       transition-all duration-200"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Product Image */}
            <div className="relative aspect-[4/3] bg-muted overflow-hidden">
              <ProductImage
                src={product.image.url}
                alt={product.image.altText || product.title}
              />
              
              {/* Price badge */}
              <div className="absolute top-3 right-3 bg-card/95 backdrop-blur-sm text-foreground text-sm font-semibold px-3 py-1.5 rounded-full border border-border">
                {formatPrice(product.price.amount)}
              </div>
            </div>
            
            {/* Product Info */}
            <div className="p-4 space-y-2">
              <h4 className="font-medium text-foreground text-[15px] line-clamp-2 group-hover:text-primary transition-colors">
                {product.title}
              </h4>
              
              <div className="flex items-center justify-between text-sm">
                {product.vendor && (
                  <span className="text-muted-foreground truncate max-w-[60%]">
                    {product.vendor}
                  </span>
                )}
                {product.productType && (
                  <span className="text-muted-foreground text-xs bg-secondary px-2 py-1 rounded-full truncate max-w-[40%]">
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
