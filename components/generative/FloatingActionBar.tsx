"use client";

import { useState, useRef, useEffect } from "react";

interface FloatingActionBarProps {
  onCameraClick: () => void;
  onUploadClick?: () => void;
  onMicClick: () => void;
  onCloseClick: () => void;
  onTextSubmit?: (text: string) => void;
  isListening?: boolean;
  isMinimized?: boolean;
  transcript?: string | null;
  isSpeaking?: boolean;
}

export default function FloatingActionBar({
  onCameraClick,
  onUploadClick,
  onMicClick,
  onCloseClick,
  onTextSubmit,
  isListening = false,
  isMinimized = false,
  transcript = null,
  isSpeaking = false,
}: FloatingActionBarProps) {
  const [isTypeMode, setIsTypeMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isTypeMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isTypeMode]);

  const handleTypeModeToggle = () => {
    setIsTypeMode(!isTypeMode);
    if (!isTypeMode) {
      setTextInput("");
    }
  };

  const handleSend = () => {
    if (textInput.trim() && onTextSubmit) {
      onTextSubmit(textInput.trim());
      setTextInput("");
      setIsTypeMode(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Text input mode
  if (isTypeMode) {
    return (
      <div 
        className={`
          fixed bottom-8 left-1/2 -translate-x-1/2 z-40
          transition-all duration-500 ease-out
          ${isMinimized ? "opacity-40 scale-95" : "opacity-100 scale-100"}
        `}
        style={{ pointerEvents: "auto" }}
      >
        <div className="
          bg-white/5 backdrop-blur-2xl
          border border-white/10
          rounded-full
          px-3 py-2.5
          shadow-lg
          flex items-center gap-2.5
          w-full max-w-md
        ">
          {/* Type activate button (left) - to deactivate */}
          <button
            onClick={handleTypeModeToggle}
            className="
              w-12 h-12 rounded-full
              flex items-center justify-center
              bg-white/5 backdrop-blur-sm
              border border-white/10
              hover:bg-white/10 hover:border-white/20
              active:scale-95
              transition-all duration-200
              flex-shrink-0
            "
            aria-label="Deactivate type mode"
          >
            <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Text input field (center) */}
          <input
            ref={inputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type text here"
            className="
              flex-1
              bg-transparent
              border-none
              outline-none
              text-white
              placeholder-white/50
              text-base
              px-2
            "
          />

          {/* Send button (right) */}
          <button
            onClick={handleSend}
            disabled={!textInput.trim()}
            className={`
              w-12 h-12 rounded-full
              flex items-center justify-center
              transition-all duration-200
              flex-shrink-0
              ${textInput.trim()
                ? "bg-white/10 hover:bg-white/20 border border-white/20 active:scale-95"
                : "bg-white/5 border border-white/10 opacity-50 cursor-not-allowed"
              }
            `}
            aria-label="Send message"
          >
            <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Button panel mode - White rounded bottom bar with transcript
  return (
    <>
      {/* Bottom glow effect - only when listening (matches Figma shadow spreading upward) */}
      {isListening && !isSpeaking && (
        <div 
          className="fixed bottom-0 left-0 right-0 h-[200px] pointer-events-none z-30"
          style={{
            background: "radial-gradient(ellipse at center bottom, rgba(33, 56, 150, 0.4) 0%, rgba(33, 56, 150, 0.3) 30%, rgba(33, 56, 150, 0.2) 60%, transparent 100%)",
            filter: "blur(60px)",
            opacity: 1,
            transition: "opacity 0.5s ease-in-out",
            boxShadow: "0px -36px 118px 0px rgba(33, 56, 150, 0.6)",
          }}
        />
      )}

      {/* White rounded bottom bar - full width */}
      <div 
        className={`
          fixed bottom-0 left-0 right-0 z-40
          transition-all duration-500 ease-out
          ${isMinimized ? "opacity-40 scale-95" : "opacity-100 scale-100"}
          w-full
        `}
        style={{ 
          pointerEvents: "auto",
          boxShadow: isListening ? "0px -36px 118px 0px rgba(33, 56, 150, 0.8)" : "none",
          transition: "box-shadow 0.5s ease-in-out",
        }}
      >
        <div className="
          bg-white
          rounded-tl-[20px] rounded-tr-[20px]
          w-full
        ">
          {isListening ? (
            // Listening state: Only mic button on the right
            <div className="flex items-center justify-end py-[20px] px-[20px]">
              <button
                onClick={onMicClick}
                className="
                  w-10 h-10 rounded-[70px]
                  bg-black
                  flex items-center justify-center
                  transition-all duration-300
                  shadow-[0px_0px_0px_4px_rgba(0,0,0,0.15)]
                  active:scale-95
                  flex-shrink-0
                "
                aria-label="Stop recording"
              >
                <img 
                  alt="Microphone" 
                  className="w-5 h-5 block"
                  src="http://localhost:3845/assets/fa5f120e1437f0370686e4d8d34e3fbc1c84959a.svg"
                />
              </button>
            </div>
          ) : (
            // Idle/AI Speaking state: User text on left, mic button on right (Figma design)
            <div className="flex items-center gap-[16px] py-[20px] px-[20px]">
              {/* User transcript text (left) - italic, matches Figma design */}
              <div className="flex-1 min-h-0">
                {isSpeaking ? (
                  // During AI speech, show placeholder
                  <p className="text-[14px] font-normal text-black/50 leading-[1.36] tracking-[-0.56px]">
                    AI is speaking...
                  </p>
                ) : transcript ? (
                  <p className="text-[14px] font-medium italic text-black leading-[1.36] tracking-[-0.56px] line-clamp-2">
                    {transcript}
                  </p>
                ) : (
                  <p className="text-[14px] font-normal text-black/70 leading-[1.36] tracking-[-0.56px]">
                    Go on, say hi, voice mode is activated!
                  </p>
                )}
              </div>

              {/* Mic button (right) - matches Figma design: bg-[#eee], size 40px, rounded-[70px] */}
              <button
                onClick={onMicClick}
                disabled={isSpeaking}
                className={`
                  w-10 h-10 rounded-[70px]
                  flex items-center justify-center
                  transition-all duration-300
                  active:scale-95
                  flex-shrink-0
                  ${isSpeaking 
                    ? "bg-[#eee] opacity-50 cursor-not-allowed" 
                    : "bg-[#eee] hover:bg-gray-200 cursor-pointer"
                  }
                `}
                aria-label={isSpeaking ? "AI is speaking" : "Start recording"}
              >
                <img 
                  alt="Microphone" 
                  className="w-5 h-5 block"
                  src="http://localhost:3845/assets/422c1f4ff5a4859d4bd7fc2b22adaf1f50beab45.svg"
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}



