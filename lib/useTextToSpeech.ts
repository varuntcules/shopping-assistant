"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseTextToSpeechReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isEnabled: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  toggle: () => void;
}

const STORAGE_KEY = "tts_enabled";

/**
 * Custom hook for text-to-speech functionality using ElevenLabs API
 */
export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTextRef = useRef<string | null>(null);

  // Update localStorage when enabled state changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(isEnabled));
    }
  }, [isEnabled]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    currentTextRef.current = null;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!isEnabled || !text || !text.trim()) {
        return;
      }

      // Stop any currently playing audio
      stop();

      // Skip if this is the same text (avoid re-speaking)
      if (currentTextRef.current === text.trim()) {
        return;
      }

      currentTextRef.current = text.trim();
      setIsLoading(true);

      try {
        // Call TTS API immediately
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: text.trim() }),
        });

        if (!response.ok) {
          console.error("[TTS] API error:", response.status);
          setIsLoading(false);
          return;
        }

        // Create audio element and play immediately
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Set up event handlers
        audio.onplay = () => {
          setIsPlaying(true);
          setIsLoading(false);
        };

        audio.onended = () => {
          setIsPlaying(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          currentTextRef.current = null;
        };

        audio.onerror = () => {
          console.error("[TTS] Audio playback error");
          setIsPlaying(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          currentTextRef.current = null;
        };

        // Start playing immediately - blob URLs are ready instantly
        await audio.play();
      } catch (error) {
        console.error("[TTS] Error:", error);
        setIsPlaying(false);
        setIsLoading(false);
        currentTextRef.current = null;
      }
    },
    [isEnabled, stop]
  );

  const toggle = useCallback(() => {
    setIsEnabled((prev) => {
      const newValue = !prev;
      if (!newValue) {
        // If disabling, stop any current playback
        stop();
      }
      return newValue;
    });
  }, [stop]);

  return {
    speak,
    stop,
    isEnabled,
    isPlaying,
    isLoading,
    toggle,
  };
}
