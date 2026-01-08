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
        relative flex items-center justify-center gap-2 px-3 py-2 rounded-xl
        transition-all duration-300 ease-out
        ${isEnabled 
          ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50" 
          : "bg-white/5 border border-white/10 hover:bg-white/10"
        }
        ${className || ""}
      `}
      aria-label={isEnabled ? "Disable text-to-speech" : "Enable text-to-speech"}
      title={isEnabled ? "Text-to-speech enabled" : "Text-to-speech disabled"}
    >
      {/* Pulse animation when playing or loading */}
      {(isPlaying || isLoading) && (
        <>
          <span className="absolute inset-0 rounded-xl bg-emerald-400 animate-ping opacity-20" />
        </>
      )}
      
      {/* Speaker icon */}
      <svg 
        className={`w-5 h-5 transition-colors ${isEnabled ? "text-white" : "text-slate-400"}`}
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        {isEnabled ? (
          // Speaker with sound waves
          <>
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
            />
          </>
        ) : (
          // Speaker muted
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
      <span className={`text-sm font-medium ${isEnabled ? "text-white" : "text-slate-400"}`}>
        {isEnabled ? "TTS On" : "TTS Off"}
      </span>
    </button>
  );
}
