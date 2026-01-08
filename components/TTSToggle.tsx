"use client";

import { useTextToSpeech } from "@/lib/useTextToSpeech";

interface TTSToggleProps {
  className?: string;
}

export default function TTSToggle({ className }: TTSToggleProps) {
  const { isEnabled, isPlaying, isLoading, toggle } = useTextToSpeech();

  return (
    <button
      type="button"
      onClick={toggle}
      className={`
        relative flex items-center justify-center gap-2 px-3 py-2 rounded-lg
        transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        ${isEnabled 
          ? "bg-success text-success-foreground" 
          : "bg-secondary border border-border text-secondary-foreground hover:bg-secondary/80"
        }
        ${className || ""}
      `}
      aria-label={isEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
      title={isEnabled ? "Text-to-speech enabled" : "Text-to-speech disabled"}
    >
      {/* Subtle pulse when playing */}
      {(isPlaying || isLoading) && (
        <span className="absolute inset-0 rounded-lg bg-success/20 animate-pulse" />
      )}
      
      {/* Speaker icon */}
      <svg 
        className="w-4 h-4 relative z-10"
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        {isEnabled ? (
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
          />
        ) : (
          <>
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
            />
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" 
            />
          </>
        )}
      </svg>
      
      {/* Label */}
      <span className="text-sm font-medium relative z-10">
        {isEnabled ? "TTS" : "TTS"}
      </span>
    </button>
  );
}
