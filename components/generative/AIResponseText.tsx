"use client";

import { useEffect, useRef } from "react";

interface AIResponseTextProps {
  text: string;
  isSpeaking: boolean;
}

export default function AIResponseText({ text, isSpeaking }: AIResponseTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep text centered as it grows
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const scrollContainer = scrollContainerRef.current;
    
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      const scrollHeight = scrollContainer.scrollHeight;
      const containerHeight = scrollContainer.clientHeight;
      
      // Calculate scroll position to center the content
      // Focus on the middle area (where the two focused lines would be)
      // The focus zone is in the middle 41px (two lines at ~20.5px each)
      const focusZoneTop = (containerHeight - 41) / 2;
      const targetScroll = Math.max(0, (scrollHeight - containerHeight) / 2);
      
      scrollContainer.scrollTo({
        top: targetScroll,
        behavior: isSpeaking ? 'smooth' : 'auto',
      });
    });
  }, [text, isSpeaking]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ 
        height: "141px",
      }}
    >
      {/* Scrollable text container */}
      <div 
        ref={scrollContainerRef}
        className="ai-response-scroll relative w-full h-full overflow-y-auto"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <p 
          className="text-[20px] font-medium text-white text-center leading-[1.2] tracking-[-0.8px] px-6"
          style={{
            paddingTop: "50px",
            paddingBottom: "50px",
          }}
        >
          {text}
        </p>
      </div>
      
      {/* Top gradient fade - fades out text above the focus zone */}
      {/* Focus zone is in the middle: ~50px from top to ~91px from top (41px for 2 lines) */}
      <div 
        className="absolute top-0 left-0 right-0 pointer-events-none z-10"
        style={{
          height: "50px",
          background: "linear-gradient(to bottom, rgba(1, 1, 1, 1) 0%, rgba(1, 1, 1, 0.8) 50%, rgba(1, 1, 1, 0) 100%)",
        }}
      />
      
      {/* Bottom gradient fade - fades out text below the focus zone */}
      <div 
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{
          height: "50px",
          background: "linear-gradient(to top, rgba(1, 1, 1, 1) 0%, rgba(1, 1, 1, 0.8) 50%, rgba(1, 1, 1, 0) 100%)",
        }}
      />
      
    </div>
  );
}

