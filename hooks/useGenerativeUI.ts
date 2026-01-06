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

  const handleAssistantResponse = useCallback((response: {
    assistantMessage: string;
    products: ProductCard[];
  }) => {
    updateConversation(response.assistantMessage);
    
    if (response.products.length > 0) {
      setProducts(response.products);
    } else {
      // No products, stay in conversation state
      setState((prev) => {
        const newState = prev.currentState === "launch" ? "intent-discovery" : "clarification";
        return { ...prev, currentState: newState };
      });
    }
  }, [updateConversation, setProducts]);

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
    reset,
  };
}





