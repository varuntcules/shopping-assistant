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
      <h3 className="text-lg font-semibold text-white/90 mb-4">
        Comparing Your Options
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product A */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="font-medium text-white mb-2">{productA.name}</h4>
          <p className="text-2xl font-bold text-violet-400 mb-4">
            ₹{productA.price.toLocaleString()}
          </p>
          {productA.description && (
            <p className="text-sm text-slate-400 line-clamp-3">
              {productA.description}
            </p>
          )}
        </div>

        {/* Product B */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="font-medium text-white mb-2">{productB.name}</h4>
          <p className="text-2xl font-bold text-violet-400 mb-4">
            ₹{productB.price.toLocaleString()}
          </p>
          {productB.description && (
            <p className="text-sm text-slate-400 line-clamp-3">
              {productB.description}
            </p>
          )}
        </div>
      </div>

      {/* Tradeoffs */}
      {tradeoffs && tradeoffs.length > 0 && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 mt-4">
          <h4 className="font-medium text-white mb-2">Key Differences:</h4>
          <ul className="space-y-1">
            {tradeoffs.map((tradeoff, index) => (
              <li key={index} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-violet-400 mt-1">•</span>
                <span>{tradeoff}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

