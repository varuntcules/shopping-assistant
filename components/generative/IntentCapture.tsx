"use client";

interface IntentCaptureProps {
  intent: string | null;
  searchContext?: string | null;
  onClear?: () => void;
}

export default function IntentCapture({ intent, searchContext, onClear }: IntentCaptureProps) {
  if (!intent && !searchContext) return null;

  const displayText = searchContext || intent;

  return (
    <div 
      className="
        bg-black/40 backdrop-blur-2xl 
        rounded-full px-5 py-3 
        border border-emerald-400/30 
        shadow-[0_4px_20px_rgba(16,185,129,0.15)]
        flex items-center gap-3
        max-w-md
        transition-all duration-300 ease-out
        animate-fadeIn
        hover:border-emerald-400/40 hover:shadow-[0_4px_24px_rgba(16,185,129,0.2)]
      "
    >
      <span className="text-white/90 font-medium text-sm line-clamp-2 flex-1 leading-relaxed text-center">
        {displayText}
      </span>
      
      {onClear && (
        <button
          onClick={onClear}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/5 active:bg-white/10 transition-all duration-200 flex-shrink-0 group"
          aria-label="Clear intent"
        >
          <svg className="w-3.5 h-3.5 text-white/50 group-hover:text-white/70 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}






