"use client";

import { useEffect, useState } from "react";

interface VoiceWaveformProps {
  isActive: boolean;
}

export default function VoiceWaveform({ isActive }: VoiceWaveformProps) {
  const [bars, setBars] = useState<number[]>([]);

  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setBars(Array.from({ length: 20 }, () => Math.random() * 40 + 20));
      }, 150);
      return () => clearInterval(interval);
    } else {
      setBars([]);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 h-16 mt-4">
      {bars.map((height, index) => (
        <div
          key={index}
          className="w-1 rounded-full transition-all duration-150 ease-out"
          style={{
            height: `${height}px`,
            background: `linear-gradient(to top, 
              ${index % 2 === 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(250, 204, 21, 0.8)'}, 
              ${index % 2 === 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(250, 204, 21, 0.4)'})`,
          }}
        />
      ))}
    </div>
  );
}





