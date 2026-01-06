"use client";

interface CartIconProps {
  itemCount: number;
  onClick?: () => void;
}

export default function CartIcon({ itemCount, onClick }: CartIconProps) {
  // Only show cart icon when there are items in the cart (after adding a product)
  if (itemCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="
        relative
        w-12 h-12 rounded-full
        flex items-center justify-center
        bg-white/5 backdrop-blur-sm
        border border-white/10
        hover:bg-white/10 hover:border-white/20
        active:scale-95
        transition-all duration-300
        animate-fadeIn
      "
      aria-label={`Cart with ${itemCount} item${itemCount !== 1 ? "s" : ""}`}
    >
      {/* Shopping bag icon */}
      <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      
      {/* Item count badge */}
      {itemCount > 0 && (
        <div className="
          absolute -top-1 -right-1
          w-5 h-5
          bg-red-500
          rounded-full
          flex items-center justify-center
          border-2 border-black
          animate-pulse
        ">
          <span className="text-white text-xs font-bold">
            {itemCount > 9 ? "9+" : itemCount}
          </span>
        </div>
      )}
    </button>
  );
}



