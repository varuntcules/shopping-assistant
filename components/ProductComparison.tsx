"use client";

import { RetailProduct } from "@/lib/types";

interface ProductComparisonProps {
  productA: RetailProduct;
  productB: RetailProduct;
  tradeoffs: string[];
}

export default function ProductComparison({
  productA,
  productB,
  tradeoffs,
}: ProductComparisonProps) {
  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        Comparing Your Options
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product A */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-medium text-foreground mb-2">{productA.name}</h4>
          <p className="text-xl font-semibold text-primary mb-4">
            ₹{productA.price.toLocaleString()}
          </p>
          {productA.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {productA.description}
            </p>
          )}
        </div>

        {/* Product B */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-medium text-foreground mb-2">{productB.name}</h4>
          <p className="text-xl font-semibold text-primary mb-4">
            ₹{productB.price.toLocaleString()}
          </p>
          {productB.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {productB.description}
            </p>
          )}
        </div>
      </div>

      {/* Tradeoffs */}
      {tradeoffs && tradeoffs.length > 0 && (
        <div className="bg-muted border border-border rounded-xl p-4 mt-4">
          <h4 className="font-medium text-foreground mb-3 text-sm">Key Differences</h4>
          <ul className="space-y-2">
            {tradeoffs.map((tradeoff, index) => (
              <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{tradeoff}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
