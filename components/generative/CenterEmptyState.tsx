"use client";

import VoiceOrb from "./VoiceOrb";

interface CenterEmptyStateProps {
  isVisible: boolean;
  isListening?: boolean;
  isSpeaking?: boolean;
}

export default function CenterEmptyState({ 
  isVisible, 
  isListening = false, 
  isSpeaking = false 
}: CenterEmptyStateProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 z-10 animate-fadeIn">
      <div className="flex flex-col items-center space-y-6">
        {/* Voice Orb */}
        <VoiceOrb isListening={isListening} isSpeaking={isSpeaking} />
        
        {/* Text below orb */}
        <div className="text-center space-y-3 max-w-sm">
          <h1 className="text-[40px] font-semibold text-white leading-[1.1] tracking-[-1.6px]">
            What do you<br />want to buy?
          </h1>
          <p className="text-base font-medium text-white/70 leading-[1.2] tracking-[-0.64px]">
            I can search anything you want...
          </p>
        </div>
      </div>
    </div>
  );
}






