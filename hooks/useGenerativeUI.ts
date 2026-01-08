"use client";

import { useState, useCallback } from "react";
import { UIState, IntentChip, VoiceState, ProductCard, ChatMessage } from "@/lib/types";

interface GenerativeUIState {
  currentState: UIState;
  intent: IntentChip | null;
  voiceState: VoiceState;
  currentProducts: ProductCard[];
  focusedProductIndex: number | null;
  conversationMessage: string | null;
  cart: ProductCard[];
  messages: ChatMessage[];
}

export function useGenerativeUI() {
  const [state, setState] = useState<GenerativeUIState>({
    currentState: "launch",
    intent: null,
    voiceState: {
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
    },
    currentProducts: [],
    focusedProductIndex: null,
    conversationMessage: null,
    cart: [],
    messages: [],
  });

  const transitionTo = useCallback((newState: UIState) => {
    setState((prev) => ({ ...prev, currentState: newState }));
  }, []);

  const updateIntent = useCallback((intent: IntentChip | null) => {
    setState((prev) => ({ ...prev, intent }));
  }, []);

  const updateVoiceState = useCallback((updates: Partial<VoiceState>) => {
    setState((prev) => ({
      ...prev,
      voiceState: { ...prev.voiceState, ...updates },
    }));
  }, []);

  const setProducts = useCallback((products: ProductCard[]) => {
    setState((prev) => ({
      ...prev,
      currentProducts: products,
      focusedProductIndex: products.length > 0 ? 0 : null,
    }));

    // Auto-transition to product reveal if we have products
    if (products.length > 0) {
      transitionTo("product-reveal");
      // Then move to exploration after a moment
      setTimeout(() => transitionTo("product-exploration"), 800);
    }
  }, [transitionTo]);

  const focusProduct = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      focusedProductIndex: index,
    }));
    transitionTo("decision");
  }, [transitionTo]);

  const addToCart = useCallback((product: ProductCard) => {
    setState((prev) => ({
      ...prev,
      cart: [...prev.cart, product],
    }));
  }, []);

  const updateConversation = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, conversationMessage: message }));
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setState((prev) => {
      // Check if the last message is already the same to prevent duplicates
      const lastMessage = prev.messages[prev.messages.length - 1];
      const isDuplicate = lastMessage?.role === message.role && 
                          lastMessage?.content === message.content;
      
      if (isDuplicate) {
        // Don't add duplicate message
        return prev;
      }
      
      return {
        ...prev,
        messages: [...prev.messages, message],
      };
    });
  }, []);

  const handleAssistantResponse = useCallback((response: {
    assistantMessage: string;
    products: ProductCard[];
    ui?: AssistantUIModel;
  }) => {
    // Only update conversation message for backward compatibility (old UI)
    // The conversation view uses the messages array, not conversationMessage
    updateConversation(response.assistantMessage);
    
    // Add assistant message to conversation (only if not already added)
    // Check if the last message is already this assistant message to prevent duplicates
    setState((prev) => {
      const lastMessage = prev.messages[prev.messages.length - 1];
      const isDuplicate = lastMessage?.role === "assistant" && 
                          lastMessage?.content === response.assistantMessage;
      
      if (isDuplicate) {
        // Don't add duplicate, just update products if needed
        return prev;
      }
      
      return {
        ...prev,
        messages: [...prev.messages, {
          role: "assistant",
          content: response.assistantMessage,
          products: response.products,
          ui: response.ui,
        }],
      };
    });
    
    if (response.products.length > 0) {
      setProducts(response.products);
    } else {
      // No products, stay in conversation state
      setState((prev) => {
        const newState = prev.currentState === "launch" ? "intent-discovery" : "clarification";
        return { ...prev, currentState: newState };
      });
    }
  }, [updateConversation, setProducts, addMessage]);

  const reset = useCallback(() => {
    setState({
      currentState: "launch",
      intent: null,
      voiceState: {
        isListening: false,
        isProcessing: false,
        isSpeaking: false,
      },
      currentProducts: [],
      focusedProductIndex: null,
      conversationMessage: null,
      cart: [],
      messages: [],
    });
  }, []);

  return {
    ...state,
    transitionTo,
    updateIntent,
    updateVoiceState,
    setProducts,
    focusProduct,
    addToCart,
    updateConversation,
    handleAssistantResponse,
    addMessage,
    reset,
  };
}






