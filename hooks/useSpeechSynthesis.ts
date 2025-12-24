"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseSpeechSynthesisReturn {
  /** Speak the given text using ElevenLabs (or fallback) */
  speak: (text: string) => Promise<void>;
  /** Stop speaking immediately */
  stop: () => void;
  /** Whether speech is currently playing */
  isSpeaking: boolean;
  /** Whether TTS is loading/processing */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Toggle voice on/off */
  isEnabled: boolean;
  setIsEnabled: (enabled: boolean) => void;
  /** Whether using fallback (Web Speech API) */
  usingFallback: boolean;
}

/**
 * Custom hook for text-to-speech
 * Uses ElevenLabs API for human-like voice, with Web Speech API fallback
 */
export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Stop any ongoing speech
  const stop = useCallback(() => {
    // Stop audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Abort any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop Web Speech API if in use
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  // Fallback to Web Speech API
  const speakWithWebSpeech = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window)) {
        reject(new Error("Speech synthesis not supported"));
        return;
      }

      // Clean text
      const cleanText = text
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
        .replace(/[*_~`#]/g, "")
        .replace(/\n+/g, ". ")
        .trim();

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      // Try to find a good voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.name.includes("Google") && v.lang.startsWith("en")
      ) || voices.find(
        (v) => v.lang.startsWith("en")
      );
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = (e) => {
        setIsSpeaking(false);
        reject(new Error(e.error));
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Main speak function - tries ElevenLabs first, falls back to Web Speech
  const speak = useCallback(async (text: string): Promise<void> => {
    if (!isEnabled || !text.trim()) return;

    // Stop any ongoing speech first
    stop();
    setError(null);
    setIsLoading(true);

    try {
      // Try ElevenLabs API first
      abortControllerRef.current = new AbortController();
      
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        // Check if it's a configuration issue (no API key)
        if (response.status === 503) {
          console.log("[TTS] ElevenLabs not configured, using fallback");
          setUsingFallback(true);
          setIsLoading(false);
          await speakWithWebSpeech(text);
          return;
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `TTS failed: ${response.status}`);
      }

      // Play the audio
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create audio element
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      setIsLoading(false);
      setUsingFallback(false);
      
      // Set up event handlers
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        setError("Audio playback failed");
        URL.revokeObjectURL(audioUrl);
      };

      // Play the audio
      await audio.play();
      
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled, not an error
        return;
      }
      
      console.warn("[TTS] ElevenLabs failed, trying fallback:", err);
      setIsLoading(false);
      
      // Try Web Speech API as fallback
      try {
        setUsingFallback(true);
        await speakWithWebSpeech(text);
      } catch (fallbackErr) {
        console.error("[TTS] Fallback also failed:", fallbackErr);
        setError("Voice synthesis unavailable");
        setIsSpeaking(false);
      }
    }
  }, [isEnabled, stop, speakWithWebSpeech]);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    isEnabled,
    setIsEnabled,
    usingFallback,
  };
}

