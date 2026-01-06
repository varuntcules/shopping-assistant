"use client";

import { useState, useRef, useEffect } from "react";
import { useGenerativeUI } from "@/hooks/useGenerativeUI";
import { AssistantResponse, ProductCard } from "@/lib/types";
import TopGestureArea from "@/components/generative/TopGestureArea";
import CenterEmptyState from "@/components/generative/CenterEmptyState";
import FloatingActionBar from "@/components/generative/FloatingActionBar";
import UserTranscript from "@/components/generative/UserTranscript";
import HorizontalProductGrid from "@/components/generative/HorizontalProductGrid";
import VoiceWaveform from "@/components/generative/VoiceWaveform";

export default function Home() {
  const ui = useGenerativeUI();
  const [isMicActive, setIsMicActive] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingTTSRef = useRef<boolean>(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState<number | undefined>(undefined);
  const productDescriptionRefs = useRef<Array<{ startTime: number; productIndex: number }>>([]);
  const questionCountRef = useRef<number>(0);
  const conversationHistoryRef = useRef<string[]>([]);

  // Create mock products for testing UI/UX
  const createMockProducts = (): ProductCard[] => {
    return [
      {
        id: "mock-1",
        title: "Professional DSLR Camera Kit",
        handle: "professional-dslr-camera-kit",
        vendor: "CameraPro",
        productType: "Camera",
        price: { amount: "89999", currencyCode: "INR" },
        image: {
          url: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=400&h=400&fit=crop",
          altText: "Professional DSLR Camera",
        },
        url: "#",
      },
      {
        id: "mock-2",
        title: "Mirrorless Camera with Lens",
        handle: "mirrorless-camera-lens",
        vendor: "PhotoTech",
        productType: "Camera",
        price: { amount: "74999", currencyCode: "INR" },
        image: {
          url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop",
          altText: "Mirrorless Camera",
        },
        url: "#",
      },
      {
        id: "mock-3",
        title: "Compact Travel Camera",
        handle: "compact-travel-camera",
        vendor: "TravelCam",
        productType: "Camera",
        price: { amount: "29999", currencyCode: "INR" },
        image: {
          url: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400&h=400&fit=crop",
          altText: "Compact Travel Camera",
        },
        url: "#",
      },
      {
        id: "mock-4",
        title: "Action Camera 4K",
        handle: "action-camera-4k",
        vendor: "ActionPro",
        productType: "Camera",
        price: { amount: "19999", currencyCode: "INR" },
        image: {
          url: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&h=400&fit=crop",
          altText: "Action Camera",
        },
        url: "#",
      },
      {
        id: "mock-5",
        title: "Vintage Film Camera",
        handle: "vintage-film-camera",
        vendor: "RetroCam",
        productType: "Camera",
        price: { amount: "14999", currencyCode: "INR" },
        image: {
          url: "https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=400&h=400&fit=crop",
          altText: "Vintage Film Camera",
        },
        url: "#",
      },
    ];
  };

  // Parse product descriptions from text and create timing map
  // Uses character-based calculation which is more accurate for TTS
  const parseProductTimings = (text: string, products: any[], audioDuration?: number) => {
    const timings: Array<{ startTime: number; productIndex: number; endTime: number }> = [];
    const productPattern = /Product\s+(\d+):/gi;
    let match;
    const matches: Array<{ index: number; productNum: number; productName?: string }> = [];
    
    // Find all product mentions with their character positions
    while ((match = productPattern.exec(text)) !== null) {
      const productNum = parseInt(match[1], 10);
      const productIndex = productNum - 1;
      
      // Try to extract the product name from the text after "Product X: "
      if (productIndex >= 0 && productIndex < products.length) {
        const product = products[productIndex];
        const afterColon = text.substring(match.index + match[0].length);
        // Find where the product name ends (usually at " at " or ". " or end of sentence)
        const nameEndMatch = afterColon.match(/\s+at\s+|\s*\.\s+|$/);
        const nameEnd = nameEndMatch ? nameEndMatch.index : afterColon.length;
        const productName = afterColon.substring(0, nameEnd).trim();
        
        matches.push({ 
          index: match.index, 
          productNum,
          productName: productName || product.title.split(' ').slice(0, 4).join(' ')
        });
      }
    }
    
    if (matches.length === 0) return timings;
    
    // Calculate timing based on character positions (more accurate for TTS)
    // Adjusted for slower, more natural speech pace with pauses
    // TTS typically speaks at ~100-120 characters per second for natural speech with pauses
    const totalChars = text.length;
    // Account for added pauses (each "..." adds ~0.3-0.5s pause)
    const pauseCount = (text.match(/\.\.\./g) || []).length;
    const pauseTime = pauseCount * 0.4; // 400ms per pause
    const charsPerSecond = 110; // Slower rate for more natural speech with pauses
    
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const productIndex = match.productNum - 1;
      
      if (productIndex >= 0 && productIndex < products.length) {
        // Calculate start time - when "Product X:" begins
        // Account for pauses before this point in the text
        const textBeforeMatch = text.substring(0, match.index);
        const pausesBefore = (textBeforeMatch.match(/\.\.\./g) || []).length;
        const pauseTimeBefore = pausesBefore * 0.4; // 400ms per pause
        
        const startCharProportion = match.index / totalChars;
        const estimatedStart = audioDuration 
          ? (startCharProportion * audioDuration) + pauseTimeBefore
          : (match.index / charsPerSecond) + pauseTimeBefore;
        
        // Calculate end time - when product name finishes being spoken
        // Estimate based on product name length
        const productName = match.productName || products[productIndex].title.split(' ').slice(0, 4).join(' ');
        const nameLength = productName.length;
        const nameDuration = audioDuration 
          ? (nameLength / charsPerSecond) * (audioDuration / (totalChars / charsPerSecond))
          : nameLength / charsPerSecond;
        
        // Find where next product starts or end of text
        const nextMatch = matches[i + 1];
        const endCharPosition = nextMatch ? nextMatch.index : totalChars;
        const endCharProportion = endCharPosition / totalChars;
        const estimatedEnd = audioDuration
          ? endCharProportion * audioDuration
          : endCharPosition / charsPerSecond;
        
        // Use a shorter highlight duration focused on when the name is spoken
        // Add extra time for the pause after "Product X:"
        const highlightEnd = Math.min(estimatedStart + nameDuration + 0.8, estimatedEnd);
        
        timings.push({
          startTime: estimatedStart,
          endTime: highlightEnd,
          productIndex
        });
      }
    }
    
    return timings;
  };

  // Play TTS audio for AI response with product highlighting
  const playTTS = async (text: string, products: any[] = []) => {
    if (isPlayingTTSRef.current) {
      console.log("[TTS] Already playing, skipping new request");
      return;
    }

    // Validate text input
    if (!text || typeof text !== "string" || !text.trim()) {
      console.warn("[TTS] Invalid text provided:", text);
      return;
    }

    try {
      isPlayingTTSRef.current = true;
      setHighlightedProductIndex(undefined);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
        try {
          audioRef.current.load();
        } catch (e) {}
        audioRef.current = null;
      }

      // Ensure text is properly formatted before sending
      const cleanText = String(text).trim();
      console.log("[TTS] Sending text to API, length:", cleanText.length);
      console.log("[TTS] Text preview:", cleanText.substring(0, 100));

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          text: cleanText 
        }),
      });

      if (!response.ok) {
        // Handle 503 (Service Unavailable) as a silent failure for account issues
        if (response.status === 503) {
          console.warn("[TTS] TTS service unavailable (503). App will continue without audio.");
          ui.updateVoiceState({ isSpeaking: false });
          isPlayingTTSRef.current = false;
          return; // Silently fail - app continues without TTS
        }
        
        console.error("[TTS] Failed to generate audio:", response.statusText);
        
        // Try to get error details for better user feedback
        try {
          const errorData = await response.json();
          console.error("[TTS] Error details:", errorData);
          
          // Check if it's the ElevenLabs account issue (multiple ways the error can appear)
          const errorText = JSON.stringify(errorData).toLowerCase();
          const isAccountIssue = 
            errorData.accountIssue === true ||
            errorData.error?.includes("Unusual activity") || 
            errorData.error?.includes("Free Tier") ||
            errorData.error?.includes("TTS unavailable") ||
            errorData.userMessage?.includes("Unusual activity") ||
            errorData.userMessage?.includes("Free Tier") ||
            errorData.userMessage?.includes("temporarily unavailable") ||
            errorText.includes("unusual activity") ||
            errorText.includes("free tier") ||
            errorText.includes("detected_unusual_activity") ||
            errorData.details?.status === "detected_unusual_activity";
          
          if (isAccountIssue) {
            // Don't show error to user - just silently fail and continue without TTS
            console.warn("[TTS] ElevenLabs account issue detected. App will continue without audio.");
            // App continues normally, just without TTS - no error message shown
          } else {
            // Show user-friendly error message for other errors
            if (errorData.userMessage) {
              ui.updateConversation(errorData.userMessage);
              setTimeout(() => ui.updateConversation(null), 8000);
            } else if (errorData.error) {
              ui.updateConversation(`TTS Error: ${errorData.error}`);
              setTimeout(() => ui.updateConversation(null), 5000);
            }
          }
        } catch (parseError) {
          // If response is not JSON, just log the status
          console.error("[TTS] Could not parse error response");
        }
        
        // Always reset state even on error so app can continue
        ui.updateVoiceState({ isSpeaking: false });
        isPlayingTTSRef.current = false;
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Parse product timings if we have products
      if (products.length > 0) {
        // Set up interval to check current time and highlight products
        let highlightInterval: NodeJS.Timeout | null = null;
        let lastHighlightedIndex: number | undefined = undefined;
        
        // Wait for audio metadata to load to get actual duration, then start highlighting
        const setupHighlighting = () => {
          // Clear any existing interval
          if (highlightInterval) {
            clearInterval(highlightInterval);
            highlightInterval = null;
          }
          
          // Always try to use actual duration for most accurate timing
          if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
            // Use actual duration for precise timing
            productDescriptionRefs.current = parseProductTimings(text, products, audio.duration);
            console.log("[TTS] Using actual audio duration:", audio.duration, "for", products.length, "products");
          } else {
            // Fallback to estimate (should rarely happen)
            productDescriptionRefs.current = parseProductTimings(text, products);
            console.log("[TTS] Using estimated timing (duration not available)");
          }
          
          // Log timings for debugging
          console.log("[TTS] Product timings:", productDescriptionRefs.current);
          
          highlightInterval = setInterval(() => {
            if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) {
              if (highlightInterval) {
                clearInterval(highlightInterval);
                highlightInterval = null;
              }
              setHighlightedProductIndex(undefined);
              lastHighlightedIndex = undefined;
              return;
            }
            
            const currentTime = audioRef.current.currentTime;
            
            // Find which product should be highlighted based on current audio time
            let activeIndex: number | undefined = undefined;
            
            // Check timings in order - find the first product that should be active
            // Use a larger tolerance to start highlighting earlier (before speech starts)
            for (let i = 0; i < productDescriptionRefs.current.length; i++) {
              const timing = productDescriptionRefs.current[i];
              // Start highlighting 0.5s BEFORE "Product X:" is spoken for better sync
              // This accounts for the delay between when audio plays and when highlighting updates
              // Also accounts for the pause before the product name
              const earlyStartTolerance = 0.5; // 500ms early start for better sync
              
              if (currentTime >= timing.startTime - earlyStartTolerance) {
                // Check if we haven't reached the next product yet
                const nextTiming = productDescriptionRefs.current[i + 1];
                if (!nextTiming || currentTime < nextTiming.startTime - earlyStartTolerance) {
                  activeIndex = timing.productIndex;
                  break;
                }
              }
            }
            
            // Only update if changed to avoid unnecessary re-renders
            if (activeIndex !== lastHighlightedIndex) {
              setHighlightedProductIndex(activeIndex);
              lastHighlightedIndex = activeIndex;
            }
          }, 50); // Check every 50ms for precise sync
        };
        
        // Set up highlighting when audio is ready
        // We need to wait for metadata to get accurate duration
        const initializeHighlighting = () => {
          // Wait a bit for audio to be fully ready
          if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
            if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
              setupHighlighting();
            }
          }
        };
        
        // Try multiple approaches to get duration
        if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
          // Duration available immediately
          setupHighlighting();
        } else {
          // Wait for metadata
          audio.addEventListener('loadedmetadata', () => {
            initializeHighlighting();
          }, { once: true });
          
          // Also try on canplay (when audio can start playing)
          audio.addEventListener('canplay', () => {
            if (!highlightInterval && audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
              setupHighlighting();
            }
          }, { once: true });
        }
        
        audio.onplay = () => {
          ui.updateVoiceState({ isSpeaking: true });
          // Ensure highlighting is set up when playback starts
          if (!highlightInterval) {
            // Final attempt with current duration
            if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
              setupHighlighting();
            }
          }
        };
        
        audio.onended = () => {
          if (highlightInterval) {
            clearInterval(highlightInterval);
            highlightInterval = null;
          }
          setHighlightedProductIndex(undefined);
          lastHighlightedIndex = undefined;
          if (audioRef.current === audio) {
            ui.updateVoiceState({ isSpeaking: false });
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
            isPlayingTTSRef.current = false;
          }
        };
        
        audio.onpause = () => {
          if (highlightInterval) {
            clearInterval(highlightInterval);
            highlightInterval = null;
          }
        };
      }

      const cleanup = () => {
        if (audioRef.current === audio) {
          ui.updateVoiceState({ isSpeaking: false });
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          isPlayingTTSRef.current = false;
          setHighlightedProductIndex(undefined);
        }
      };

      if (products.length === 0) {
        audio.onplay = () => {
          ui.updateVoiceState({ isSpeaking: true });
        };
        audio.onended = cleanup;
      }
      
      audio.onerror = (error) => {
        console.error("[TTS] Audio playback error:", error);
        cleanup();
      };

      await audio.play().catch((error) => {
        console.error("[TTS] Play error:", error);
        cleanup();
      });
    } catch (error) {
      console.error("[TTS] Error playing audio:", error);
      ui.updateVoiceState({ isSpeaking: false });
      isPlayingTTSRef.current = false;
      setHighlightedProductIndex(undefined);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error: any) {
      console.error("Microphone permission error:", error);
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        ui.updateConversation("Please allow microphone access to use voice features.");
        setTimeout(() => ui.updateConversation(null), 5000);
      }
      return false;
    }
  };

  const handleMicClick = async () => {
    if (isMicActive) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsMicActive(false);
      ui.updateVoiceState({ isListening: false });
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        ui.updateConversation("Speech recognition is not supported in this browser.");
        setTimeout(() => ui.updateConversation(null), 5000);
        return;
      }

      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) return;

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        
        recognition.onstart = () => {
          setIsMicActive(true);
          ui.updateVoiceState({ isListening: true });
          ui.updateConversation(null);
          setUserTranscript("");
          setInterimTranscript("");
          finalTranscriptRef.current = "";
        };
        
        recognition.onresult = (event: any) => {
          let newFinalTranscript = "";
          let interim = "";
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              newFinalTranscript += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          
          if (newFinalTranscript) {
            finalTranscriptRef.current += newFinalTranscript;
          }
          
          const displayText = finalTranscriptRef.current + interim;
          setUserTranscript(displayText.trim() || null);
          setInterimTranscript(interim);
          
          if (newFinalTranscript.trim() && !interim) {
            const completeTranscript = finalTranscriptRef.current.trim();
            if (completeTranscript) {
              handleVoiceTranscript(completeTranscript);
              recognition.stop();
            }
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsMicActive(false);
          ui.updateVoiceState({ isListening: false });
          
          if (event.error === "not-allowed") {
            ui.updateConversation("Microphone access denied. Please allow access in settings.");
            setTimeout(() => ui.updateConversation(null), 5000);
          }
        };
        
        recognition.onend = () => {
          setIsMicActive(false);
          ui.updateVoiceState({ isListening: false });
          setInterimTranscript("");
          
          const finalText = finalTranscriptRef.current.trim();
          if (finalText) {
            handleVoiceTranscript(finalText);
          }
        };
        
        recognitionRef.current = recognition;
        recognition.start();
      } catch (error: any) {
        console.error("Failed to start recognition:", error);
        ui.updateConversation("Failed to start voice recognition. Please try again.");
        setTimeout(() => ui.updateConversation(null), 5000);
      }
    }
  };

  const handleVoiceTranscript = (transcript: string) => {
    setIsMicActive(false);
    setUserTranscript(transcript);
    handleSubmit(transcript);
  };

  // Parse product selection from voice command
  const parseProductSelection = (message: string): number | null => {
    const lowerMessage = message.toLowerCase().trim();
    
    const patterns = [
      /add\s+(?:product\s+)?(?:number\s+)?(\d+)/i,
      /add\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)/i,
      /add\s+(\d+)/i,
      /(?:select|choose|pick)\s+(?:product\s+)?(?:number\s+)?(\d+)/i,
      /(?:select|choose|pick)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)/i,
    ];

    for (const pattern of patterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        const value = match[1];
        
        const wordToNumber: Record<string, number> = {
          first: 0, "1st": 0,
          second: 1, "2nd": 1,
          third: 2, "3rd": 2,
          fourth: 3, "4th": 3,
          fifth: 4, "5th": 4,
        };
        
        if (wordToNumber[value.toLowerCase()] !== undefined) {
          return wordToNumber[value.toLowerCase()];
        }
        
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 1 && num <= 5) {
          return num - 1;
        }
      }
    }
    
    return null;
  };

  // Handle adding product to cart
  const handleAddToCart = async (productIndex: number) => {
    const products = ui.currentProducts;
    if (productIndex < 0 || productIndex >= products.length) {
      ui.updateConversation("Product not found. Please try again.");
      setTimeout(() => ui.updateConversation(null), 3000);
      return;
    }

    const product = products[productIndex];
    
    try {
      ui.updateVoiceState({ isProcessing: true });
      
      let variantId: number | undefined;
      
      // Fetch variant ID from product handle or ID
      const variantResponse = await fetch("/api/cart/get-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          productHandle: product.handle,
          productId: product.id,
        }),
      });

      const variantData = await variantResponse.json();
      
      if (!variantData.success || !variantData.variantId) {
        throw new Error("Could not get product variant information");
      }
      
      variantId = variantData.variantId;

      // Add to cart
      const response = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId,
          quantity: 1,
        }),
      });

      const data = await response.json();

      if (data.success) {
        ui.addToCart(product);
        
        // Use full product name in TTS message - simple and clear
        const productName = product.title;
        const confirmationMessage = `${productName} added to your cart.`;
        const displayMessage = `Added ${productName} to your cart. You now have ${ui.cart.length + 1} item${ui.cart.length + 1 !== 1 ? 's' : ''} in your cart.`;
        
        ui.updateConversation(displayMessage);
        
        // TTS should speak the product name clearly
        await playTTS(confirmationMessage, []);
        
        // Show confirmation for longer
        setTimeout(() => {
          ui.updateConversation(null);
        }, 4000);
      } else {
        throw new Error(data.error || "Failed to add to cart");
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add product to cart";
      ui.updateConversation(`Sorry, I couldn't add that to your cart. ${errorMessage}`);
      setTimeout(() => ui.updateConversation(null), 5000);
    } finally {
      ui.updateVoiceState({ isProcessing: false });
    }
  };

  const handleSubmit = async (message: string) => {
    if (!message.trim()) return;

    // Check if this is a product selection command when products are shown
    // Allow cart commands even while AI is speaking
    if (ui.currentProducts.length > 0) {
      const productIndex = parseProductSelection(message);
      if (productIndex !== null) {
        // Stop any playing audio when user wants to add to cart
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          ui.updateVoiceState({ isSpeaking: false });
        }
        await handleAddToCart(productIndex);
        return;
      }
    }

    // Stop any playing audio for new queries
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      ui.updateVoiceState({ isSpeaking: false });
    }

    ui.updateVoiceState({ isListening: false, isProcessing: true });
    setIsMicActive(false);

    if (ui.currentState === "launch") {
      ui.transitionTo("intent-discovery");
      ui.updateIntent({ text: message, confidence: 0.7 });
    }

    // Track conversation BEFORE API call
    // Only increment if we don't have products yet (to allow questions before showing products)
    if (ui.currentProducts.length === 0) {
      questionCountRef.current += 1;
    }
    conversationHistoryRef.current.push(message);

    // On first question, encourage the AI to ask a clarifying question instead of showing products immediately
    // After 2 questions, force search mode - modify message to force product search
    // But only if we don't already have products
    let apiMessage = message;
    if (ui.currentProducts.length === 0) {
      if (questionCountRef.current === 1) {
        // First question - STRONGLY encourage asking a follow-up question, do NOT show products yet
        apiMessage = `${message}. IMPORTANT: This is the user's first question. Please ask them ONE clarifying question to better understand their needs. Do NOT show products yet. Only ask a question.`;
      } else if (questionCountRef.current >= 2) {
        // After 2 questions, force search mode
        apiMessage = `${message} - please show me products now, I don't need more questions`;
      }
    }

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: apiMessage,
          history: [],
        }),
      });

      let errorMessage: string | null = null;
      let data: AssistantResponse | null = null;
      
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const responseData = await response.json();
          data = responseData as AssistantResponse;
          
          if (responseData.error) {
            errorMessage = responseData.error;
          } else if (responseData.assistantMessage) {
            data = responseData;
          }
        } else {
          const text = await response.text();
          errorMessage = text || response.statusText || `API error: ${response.status}`;
        }
      } catch (parseError) {
        console.error("[Client] Error parsing response:", parseError);
        errorMessage = response.statusText || `API error: ${response.status}`;
      }
      
      if (errorMessage && !data) {
        ui.updateConversation(`Oops! ${errorMessage}`);
        ui.updateVoiceState({ isProcessing: false });
        setTimeout(() => ui.updateConversation(null), 5000);
        return;
      }
      
      if (!data) {
        ui.updateConversation("I'm having trouble processing that. Please try again.");
        ui.updateVoiceState({ isProcessing: false });
        setTimeout(() => ui.updateConversation(null), 5000);
        return;
      }

      const limitedProducts = (data.products || []).slice(0, 5);
      
      // After 2 questions, force show products (mock or real) - STOP asking questions
      if (questionCountRef.current >= 2 && limitedProducts.length === 0) {
        // Try to get real products first using knowledge base search
        const searchQuery = ui.intent?.text || conversationHistoryRef.current[0] || message;
        let productsToShow: ProductCard[] = [];
        let messageToShow = "Here are some products I found:";
        
        try {
          // Try to fetch real products directly from knowledge base
          const searchResponse = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `${searchQuery} - please show me products now`,
              history: [],
            }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json() as AssistantResponse;
            productsToShow = (searchData.products || []).slice(0, 5);
            if (searchData.assistantMessage && productsToShow.length > 0) {
              messageToShow = searchData.assistantMessage;
            }
          }
        } catch (searchError) {
          console.error("Error fetching products after 2 questions:", searchError);
        }
        
        // If no real products found, use mock products
        if (productsToShow.length === 0) {
          productsToShow = createMockProducts();
          // Create message with all product names for sequential highlighting
          const productDescriptions = productsToShow.map((product, index) => {
            const price = parseFloat(product.price.amount);
            const formattedPrice = product.price.currencyCode === "INR"
              ? `₹${price.toLocaleString("en-IN")}`
              : new Intl.NumberFormat("en-US", { style: "currency", currency: product.price.currencyCode }).format(price);
            
            const shortTitle = product.title.split(' ').slice(0, 4).join(' ');
            return `Product ${index + 1}: ${shortTitle} at ${formattedPrice}`;
          }).join(". ");
          
          messageToShow = `Here are some camera options for you: ${productDescriptions}.`;
        } else {
          // Ensure real products message includes all product names
          const hasProductMentions = /Product\s+\d+:/i.test(messageToShow);
          if (!hasProductMentions && productsToShow.length > 0) {
            const productDescriptions = productsToShow.map((product, index) => {
              const price = parseFloat(product.price.amount);
              const formattedPrice = product.price.currencyCode === "INR"
                ? `₹${price.toLocaleString("en-IN")}`
                : new Intl.NumberFormat("en-US", { style: "currency", currency: product.price.currencyCode }).format(price);
              
              const shortTitle = product.title.split(' ').slice(0, 4).join(' ');
              return `Product ${index + 1}: ${shortTitle} at ${formattedPrice}`;
            }).join(". ");
            
            messageToShow = `${messageToShow} Here are ${productsToShow.length} options: ${productDescriptions}.`;
          }
        }
        
        // Show products and stop asking questions
        setUserTranscript(null);
        setInterimTranscript("");
        questionCountRef.current = 0; // Reset counter
        
        ui.handleAssistantResponse({
          assistantMessage: messageToShow,
          products: productsToShow,
        });
        
        ui.updateIntent({ text: "Found products", confidence: 1 });
        ui.updateVoiceState({ isProcessing: false });
        
        // Play TTS for the product announcement with all products mentioned
        await playTTS(messageToShow, productsToShow);
        return; // Exit early, don't process the original response that asks questions
      }
      
      // Normal flow - show products if available
      if (limitedProducts.length > 0) {
        setUserTranscript(null);
        setInterimTranscript("");
        questionCountRef.current = 0; // Reset counter when products are shown
      }
      
      ui.handleAssistantResponse({
        assistantMessage: data.assistantMessage,
        products: limitedProducts,
      });

      if (data.products.length > 0) {
        ui.updateIntent({ text: data.ui.title || "Found products", confidence: 1 });
        questionCountRef.current = 0; // Reset counter when products are shown
      } else {
        // If no products, this was a question - don't reset counter yet
        // Counter will be used to force products after 2 questions
      }

      ui.updateVoiceState({ isProcessing: false });
      
      // When products are shown, ensure TTS mentions all products sequentially
      if (data.assistantMessage && limitedProducts.length > 0) {
        // Check if the message already includes product descriptions
        const hasProductMentions = /Product\s+\d+:/i.test(data.assistantMessage);
        
        if (!hasProductMentions) {
          // Add product descriptions to the message for TTS
          const productDescriptions = limitedProducts.map((product, index) => {
            const price = parseFloat(product.price.amount);
            const formattedPrice = product.price.currencyCode === "INR"
              ? `₹${price.toLocaleString("en-IN")}`
              : new Intl.NumberFormat("en-US", { style: "currency", currency: product.price.currencyCode }).format(price);
            
            const shortTitle = product.title.split(' ').slice(0, 4).join(' ');
            return `Product ${index + 1}: ${shortTitle} at ${formattedPrice}`;
          }).join(". ");
          
          const enhancedMessage = `${data.assistantMessage} Here are ${limitedProducts.length} options: ${productDescriptions}.`;
          await playTTS(enhancedMessage, limitedProducts);
        } else {
          // Message already includes products, use as-is
          await playTTS(data.assistantMessage, limitedProducts);
        }
      } else if (data.assistantMessage) {
        await playTTS(data.assistantMessage, limitedProducts);
      }
      
      // Clear transcript after a delay if no products
      if (limitedProducts.length === 0) {
        setTimeout(() => {
          setUserTranscript(null);
        }, 2000);
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Something went wrong.";
      
      let userMessage = "Oops! Something went wrong.";
      if (errorMessage.includes("API key") || errorMessage.includes("not configured")) {
        userMessage = "The AI service needs to be configured. Please check your settings.";
      } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server")) {
        userMessage = "The server is having trouble. Please try again in a moment.";
      } else if (errorMessage.length < 100) {
        userMessage = errorMessage;
      }
      
      ui.updateConversation(userMessage);
      ui.updateVoiceState({ isProcessing: false });
      setTimeout(() => ui.updateConversation(null), 5000);
    }
  };

  const hasProducts = ui.currentProducts.length > 0;
  const isIdleState = ui.currentState === "launch" && !ui.conversationMessage && !hasProducts;
  const showResponse = ui.conversationMessage;
  const isMinimized = hasProducts || showResponse;

  return (
    <div className="h-screen bg-black overflow-hidden relative w-full max-w-md mx-auto" style={{ maxWidth: "100vw" }}>
      {/* Full-screen black background */}
      <div className="absolute inset-0 bg-black" />
      
      {/* Subtle red gradient overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute bottom-0 left-0 right-0 h-[40vh] opacity-40 transition-opacity duration-700"
          style={{
            background: "radial-gradient(ellipse at center bottom, rgba(239, 68, 68, 0.2) 0%, rgba(250, 204, 21, 0.1) 40%, transparent 70%)",
            filter: "blur(100px)",
          }}
        />
      </div>

      {/* Top bar with swipe down and intent capture */}
      <TopGestureArea 
        intent={ui.intent?.text || null}
        searchContext={hasProducts ? `Finding ${ui.currentProducts.length} products...` : ui.voiceState.isProcessing ? "Searching..." : null}
        cartItemCount={ui.cart.length}
        onSwipeDown={() => {
          console.log("Swipe down to show previous conversations");
        }}
        onClearIntent={() => ui.updateIntent(null)}
        onCartClick={() => {
          console.log("Cart clicked, items:", ui.cart.length);
        }}
        isActive={isMicActive || ui.voiceState.isSpeaking}
      />

      {/* Center empty state */}
      <CenterEmptyState isVisible={isIdleState && !isMicActive} />

      {/* User transcript + Voice Waveform - Only show when listening or when no products */}
      {(isMicActive || (userTranscript && !hasProducts)) && (
        <div className="fixed left-1/2 -translate-x-1/2 z-30 top-1/2 -translate-y-1/2 animate-fadeIn w-full px-4 flex flex-col items-center">
          <UserTranscript 
            transcript={userTranscript || interimTranscript} 
            isListening={isMicActive}
          />
          <VoiceWaveform isActive={isMicActive} />
          {isMicActive && <p className="text-white/70 text-sm mt-2">Listening...</p>}
        </div>
      )}

      {/* Main content area - Products and AI response (when products are shown) */}
      {!isMicActive && hasProducts && (
        <div className="fixed left-1/2 -translate-x-1/2 z-30 w-full animate-fadeIn flex flex-col items-center"
          style={{
            top: "120px",
            bottom: "140px",
            maxHeight: "calc(100vh - 260px)",
            overflowY: "auto",
            overflowX: "hidden",
            paddingBottom: "20px",
            width: "100%",
            maxWidth: "100vw",
          }}
        >
          {/* Products */}
          <div className="w-full flex-shrink-0 mb-6" style={{ overflowX: "visible" }}>
            <HorizontalProductGrid 
              products={ui.currentProducts.slice(0, 5)}
              highlightedIndex={highlightedProductIndex}
              onProductClick={(product) => {
                console.log("Product clicked:", product);
              }}
            />
          </div>

          {/* AI response - Below products with proper spacing */}
          {showResponse && (
            <div className="w-full px-4 flex-shrink-0 mt-4">
              <div className="flex flex-col items-center justify-center">
                <p className="text-white text-base font-normal leading-relaxed text-center max-w-lg line-clamp-2">
                  {ui.conversationMessage}
                </p>
                {ui.voiceState.isSpeaking && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-white/60 text-xs">Speaking...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI response only (when no products - centered) */}
      {showResponse && !isMicActive && !hasProducts && (
        <div className="fixed left-1/2 -translate-x-1/2 z-30 w-full px-4 animate-fadeIn"
          style={{
            top: "50%",
            transform: "translate(-50%, -50%)",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div className="flex flex-col items-center justify-center">
            <p className="text-white text-base font-normal leading-relaxed text-center max-w-lg line-clamp-2">
              {ui.conversationMessage}
            </p>
            {ui.voiceState.isSpeaking && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white/60 text-xs">Speaking...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating action bar */}
      <FloatingActionBar
        onCameraClick={() => {}}
        onUploadClick={() => {}}
        onMicClick={handleMicClick}
        onCloseClick={() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
          }
          isPlayingTTSRef.current = false;
          ui.reset();
          setIsMicActive(false);
          setUserTranscript(null);
          ui.updateVoiceState({ isSpeaking: false });
          questionCountRef.current = 0;
          conversationHistoryRef.current = [];
        }}
        onTextSubmit={handleSubmit}
        isListening={isMicActive}
        isMinimized={isMinimized}
      />
    </div>
  );
}
