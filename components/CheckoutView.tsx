"use client";

import { RetailProduct } from "@/lib/types";
import { useState } from "react";

interface CheckoutViewProps {
  items: RetailProduct[];
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CheckoutView({
  items,
  total,
  onConfirm,
  onCancel,
}: CheckoutViewProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    // Simulate order processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsConfirming(false);
    setIsConfirmed(true);
    onConfirm();
  };

  if (isConfirmed) {
    return (
      <div className="mt-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          Order Confirmed!
        </h3>
        <p className="text-slate-300 mb-4">
          Your order has been placed successfully. You'll receive a confirmation email shortly.
        </p>
        <p className="text-sm text-slate-400">
          Total: ₹{total.toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Review Your Order</h3>
      
      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between bg-white/5 rounded-lg p-3"
          >
            <div className="flex-1">
              <h4 className="font-medium text-white">{item.name}</h4>
              <p className="text-sm text-slate-400">{item.category}</p>
            </div>
            <p className="text-violet-400 font-semibold">
              ₹{item.price.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 pt-4 mb-6">
        <div className="flex items-center justify-between text-lg font-semibold text-white">
          <span>Total</span>
          <span className="text-violet-400">₹{total.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500
                   text-white font-medium py-3 rounded-lg
                   hover:from-violet-400 hover:to-fuchsia-400
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
        >
          {isConfirming ? "Processing..." : "Confirm Order"}
        </button>
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="px-6 py-3 bg-white/5 border border-white/10
                   text-white rounded-lg
                   hover:bg-white/10
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

