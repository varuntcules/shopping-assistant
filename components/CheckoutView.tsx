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
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsConfirming(false);
    setIsConfirmed(true);
    onConfirm();
  };

  if (isConfirmed) {
    return (
      <div className="mt-6 bg-success/10 border border-success/20 rounded-xl p-6 text-center">
        <div className="w-14 h-14 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-success"
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
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Order Confirmed
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Your order has been placed successfully. You'll receive a confirmation email shortly.
        </p>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-semibold text-foreground">₹{total.toLocaleString()}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-card border border-border rounded-xl p-6">
      <h3 className="text-base font-semibold text-foreground mb-4">Review Your Order</h3>
      
      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between bg-muted rounded-lg p-3"
          >
            <div className="flex-1">
              <h4 className="font-medium text-foreground text-sm">{item.name}</h4>
              <p className="text-xs text-muted-foreground">{item.category}</p>
            </div>
            <p className="text-primary font-semibold">
              ₹{item.price.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 mb-6">
        <div className="flex items-center justify-between text-base font-semibold text-foreground">
          <span>Total</span>
          <span className="text-primary">₹{total.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className="flex-1 bg-primary text-primary-foreground font-medium py-3 rounded-lg
                   hover:bg-primary/90
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors duration-200
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {isConfirming ? "Processing..." : "Confirm Order"}
        </button>
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="px-6 py-3 bg-secondary border border-border
                   text-secondary-foreground rounded-lg
                   hover:bg-secondary/80
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors duration-200
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
