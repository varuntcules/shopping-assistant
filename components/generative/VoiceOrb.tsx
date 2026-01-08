"use client";

interface VoiceOrbProps {
  isListening: boolean;
  isSpeaking: boolean;
}

// Figma image asset
const orbImage = "http://localhost:3845/assets/8a57514c33d58ac89f296d7b6fcd5109b953a18f.png";

export default function VoiceOrb({ isListening, isSpeaking }: VoiceOrbProps) {
  const isActive = isListening || isSpeaking;

  return (
    <div 
      className="relative"
      style={{
        aspectRatio: "255/199",
        width: "100%",
      }}
    >
      <div 
        className={`absolute inset-0 overflow-hidden pointer-events-none ${
          isSpeaking 
            ? "animate-orb-calm-pulse" 
            : isListening 
            ? "animate-orb-pulse" 
            : ""
        }`}
        style={{
          filter: isSpeaking 
            ? "drop-shadow(0 0 20px rgba(139, 92, 246, 0.2))" 
            : isListening 
            ? "drop-shadow(0 0 40px rgba(139, 92, 246, 0.5))" 
            : "none",
        }}
      >
        <img 
          alt="Voice orb" 
          className="absolute pointer-events-none"
          src={orbImage}
          style={{
            height: "119.88%",
            left: "-9.8%",
            maxWidth: "none",
            top: "-9.94%",
            width: "119.61%",
          }}
        />
      </div>
      
    </div>
  );
}

