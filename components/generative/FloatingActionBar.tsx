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
}

export default function FloatingActionBar({
  onCameraClick,
  onUploadClick,
  onMicClick,
  onCloseClick,
  onTextSubmit,
  isListening = false,
  isMinimized = false,
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

  // Button panel mode
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
      ">
        {/* Camera button */}
        <button
          onClick={onCameraClick}
          className="
            w-12 h-12 rounded-full
            flex items-center justify-center
            bg-white/5 backdrop-blur-sm
            border border-white/10
            hover:bg-white/10 hover:border-white/20
            active:scale-95
            transition-all duration-200
          "
          aria-label="Camera"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 001.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Type mode button */}
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
          "
          aria-label="Activate type mode"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {/* Upload button */}
        {onUploadClick && (
          <button
            onClick={onUploadClick}
            className="
              w-12 h-12 rounded-full
              flex items-center justify-center
              bg-white/5 backdrop-blur-sm
              border border-white/10
              hover:bg-white/10 hover:border-white/20
              active:scale-95
              transition-all duration-200
            "
            aria-label="Upload"
          >
            <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>
        )}

        {/* Mic button - Primary, red when active */}
        <button
          onClick={onMicClick}
          className={`
            w-14 h-14 rounded-full
            flex items-center justify-center
            transition-all duration-300
            ${isListening
              ? "bg-red-500 shadow-lg shadow-red-500/50 scale-110"
              : "bg-red-500 shadow-lg shadow-red-500/30 hover:scale-105"
            }
            active:scale-95
          `}
          aria-label={isListening ? "Stop recording" : "Start recording"}
        >
          {isListening ? (
            <div className="w-5 h-5 bg-white rounded-sm" />
          ) : (
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>

        {/* Close button */}
        <button
          onClick={onCloseClick}
          className="
            w-12 h-12 rounded-full
            flex items-center justify-center
            bg-white/5 backdrop-blur-sm
            border border-white/10
            hover:bg-white/10 hover:border-white/20
            active:scale-95
            transition-all duration-200
          "
          aria-label="Close"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}



