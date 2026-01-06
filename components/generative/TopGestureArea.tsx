"use client";

import { useState } from "react";
import IntentCapture from "./IntentCapture";
import CartIcon from "./CartIcon";

interface TopGestureAreaProps {
  intent: string | null;
  searchContext?: string | null;
  cartItemCount?: number;
  onSwipeDown?: () => void;
  onClearIntent?: () => void;
  onCartClick?: () => void;
  isActive?: boolean;
}

export default function TopGestureArea({ 
  intent, 
  searchContext,
  cartItemCount = 0,
  onSwipeDown, 
  onClearIntent,
  onCartClick,
  isActive = false 
}: TopGestureAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches[0].clientY < 60) {
      setIsDragging(true);
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 50) {
      onSwipeDown?.();
      setIsDragging(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div 
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Subtle swipe indicator at very top edge */}
      <div className="h-12 flex items-start justify-center pt-2 pointer-events-auto">
        <div className="w-10 h-0.5 bg-white/20 rounded-full transition-opacity duration-300 hover:opacity-40" />
      </div>

      {/* Intent chip with cart icon - Horizontally aligned */}
      <div className="flex items-center justify-center gap-3 pt-2 px-4 pointer-events-auto">
        {/* Cart icon - Left side */}
        <CartIcon itemCount={cartItemCount} onClick={onCartClick} />
        
        {/* Intent chip - Center */}
        <IntentCapture intent={intent} searchContext={searchContext} onClear={onClearIntent} />
      </div>
    </div>
  );
}





