"use client";

import { useState } from "react";

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

      {/* Intent text with repeat icon - New Figma style */}
      {intent && (
        <div className="flex items-center justify-center gap-3 px-[44px] py-[12px] pointer-events-auto">
          <p className="text-[20px] font-medium text-white text-center tracking-[-0.8px] leading-[1.2] whitespace-nowrap">
            {intent}
          </p>
          <button
            onClick={onClearIntent}
            className="w-5 h-5 flex items-center justify-center flex-shrink-0"
            aria-label="Repeat search"
          >
            <img 
              alt="Repeat" 
              className="w-full h-full block"
              src="http://localhost:3845/assets/432c025dcd7440917fea6993eafc1f64d1b319de.svg"
            />
          </button>
        </div>
      )}
      
      {/* Fallback: Show search context if no intent */}
      {!intent && searchContext && (
        <div className="flex items-center justify-center gap-3 px-[44px] py-[12px] pointer-events-auto">
          <p className="text-[20px] font-medium text-white text-center tracking-[-0.8px] leading-[1.2] whitespace-nowrap">
            {searchContext}
          </p>
        </div>
      )}
    </div>
  );
}






