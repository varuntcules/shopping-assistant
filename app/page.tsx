"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Chat from "@/components/Chat";
import VoiceInput from "@/components/VoiceInput";
import { ChatMessage, AssistantResponse } from "@/lib/types";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  const handleVoiceTranscript = (transcript: string) => {
    setInputValue(transcript);
    // Focus the textarea so user can edit if needed
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    
    const message = inputValue.trim();
    if (!message || isLoading) return;

    // Add user message immediately
    const userMessage: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messages,
        }),
      });

      const data: AssistantResponse = await response.json();

      // Add assistant message with products
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.assistantMessage,
        products: data.products,
        ui: data.ui,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Log debug info to console (helpful for development)
      if (data.debug) {
        console.log("[Debug]", data.debug);
      }
    } catch (error) {
      console.error("Error:", error);
      
      // Add error message
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Oops! Something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Voice Shopping Assistant</h1>
              <p className="text-xs text-slate-400">Speak or type to find products</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI-Powered</span>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="relative z-10 flex-1 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 scroll-smooth"
        >
          <Chat messages={messages} isLoading={isLoading} />
        </div>

        {/* Input area */}
        <div className="border-t border-white/5 bg-black/30 backdrop-blur-xl p-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <VoiceInput 
              onTranscript={handleVoiceTranscript}
              disabled={isLoading}
            />
            
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell me what you're looking for... I'll help you find the perfect match"
                disabled={isLoading}
                rows={1}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-12
                         text-white placeholder-slate-500 resize-none
                         focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
              />
              
              {/* Character hint */}
              <div className="absolute right-3 bottom-3 text-xs text-slate-600">
                {inputValue.length > 0 && (
                  <span>Press Enter to send</span>
                )}
              </div>
            </div>
            
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="flex-shrink-0 w-12 h-12 rounded-xl
                       bg-gradient-to-br from-violet-500 to-fuchsia-500
                       hover:from-violet-400 hover:to-fuchsia-400
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50
                       transition-all duration-200 hover:scale-105
                       flex items-center justify-center"
              aria-label="Send message"
            >
              {isLoading ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
          
          {/* Quick suggestions */}
          {messages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {[
                "I need running shoes",
                "Help me pick a laptop",
                "What should I look for in headphones?",
                "Find me a gift under ₹2000",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInputValue(suggestion)}
                  className="text-sm px-4 py-2 rounded-full
                           bg-white/5 border border-white/10
                           text-slate-300 hover:text-white
                           hover:bg-white/10 hover:border-violet-500/30
                           transition-all duration-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
