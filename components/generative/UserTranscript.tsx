"use client";

import { useEffect, useRef } from "react";

interface UserTranscriptProps {
  transcript: string | null;
  isListening?: boolean;
}

export default function UserTranscript({ transcript, isListening = false }: UserTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && transcript) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [transcript]);

  if (!transcript && !isListening) return null;

  const displayText = transcript || (isListening ? "Listening..." : "");
  
  const words = displayText.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  words.forEach((word) => {
    if ((currentLine + " " + word).length > 55) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  
  const displayLines = lines.length > 0 ? lines : [displayText];

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto px-4">
      <div 
        ref={scrollRef}
        className="
          max-h-[4.5rem] 
          overflow-y-auto 
          pr-2
          custom-scrollbar
          text-center
        "
        style={{
          scrollBehavior: 'smooth',
          lineHeight: '1.5rem',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {displayLines.map((line, index) => (
          <p 
            key={index}
            className={`
              font-normal text-base leading-relaxed
              ${index === displayLines.length - 1 ? "text-white" : "text-white/60"}
            `}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}





