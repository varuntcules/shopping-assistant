"use client";

import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import Chat from "@/components/Chat";
import VoiceInput from "@/components/VoiceInput";
import TTSToggle from "@/components/TTSToggle";
import { ChatMessage, GeneratedUIBlock } from "@/lib/types";
import { type GenerativeRetailUIMessage } from "@/lib/generativeAgent";

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const chatTransport = useMemo(
    () => new DefaultChatTransport<GenerativeRetailUIMessage>({ api: "/api/assistant/genui" }),
    []
  );
  const { messages: agentMessages, sendMessage, status } = useChat<GenerativeRetailUIMessage>({
    id: "retail-genui",
    transport: chatTransport,
  });
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [agentMessages, status]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  const handleVoiceTranscript = (transcript: string) => {
    setInputValue(transcript);
    textareaRef.current?.focus();
  };

  const handleChipSelect = async (chip: string) => {
    setInputValue(chip);
    await sendMessage({ text: chip });
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    const message = inputValue.trim();
    if (!message || status === "streaming") return;

    setInputValue("");
    await sendMessage({ text: message });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const mappedMessages = useMemo<ChatMessage[]>(() => {
    return agentMessages
      .filter((msg) => msg.role !== "system")
      .map((msg) => {
        const textParts = msg.parts
          .filter((part) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n\n");

        const generatedUI: GeneratedUIBlock[] = [];

        const mapped: ChatMessage = {
          role: msg.role === "user" ? "user" : "assistant",
          content: textParts,
          generatedUI,
        };

        for (const part of msg.parts) {
          if (part.type === "tool-retail_assistant" && part.state === "output-available") {
            const output: any = (part as any).output;
            if (output) {
              mapped.content = output.message || textParts || "Here are some options:";
              mapped.products =
                output.products?.map((p: any) => ({
                  id: String(p.productId ?? p.id ?? p.variantId ?? crypto.randomUUID()),
                  title: p.title,
                  handle: p.handle ?? "",
                  vendor: "Store",
                  productType: output.collectedInfo?.product_type || "camera",
                  price: {
                    amount: String(p.price ?? p.price_min ?? 0),
                    currencyCode: "INR",
                  },
                  image: {
                    url: p.imageUrl || "/placeholder-product.svg",
                    altText: p.title || "Product",
                  },
                  url: `#product-${p.productId ?? p.id ?? ""}`,
                })) || [];
              mapped.ui = {
                layout: "grid",
                title: output.ui?.type === "recommendation" ? "Recommended Products" : "",
                mode: output.ui?.type === "question" ? "education" : "shopping",
                retailUI: output.ui,
              };
              mapped.confidence = output.products?.length ? 0.75 : undefined;

              // If retail tool also wants to surface a generative block, honor it
              if (output.uiBlock) {
                generatedUI.push(output.uiBlock);
              }
            }
          }

          // Handle generative UI tool outputs
          if (part.type?.startsWith("tool-") && part.state === "output-available") {
            const output: any = (part as any).output || (part as any).result || (part as any).data;
            if (output?.uiBlock) {
              generatedUI.push(output.uiBlock as GeneratedUIBlock);
            } else if (Array.isArray(output?.uiBlocks)) {
              generatedUI.push(...(output.uiBlocks as GeneratedUIBlock[]));
            }
          }
        }

        // If we have no text content but a question block, use its prompt for the bubble
        if (!mapped.content && generatedUI.length > 0) {
          const question = generatedUI.find((b) => b.kind === "question") as any;
          const education = generatedUI.find((b) => b.kind === "education") as any;
          mapped.content = question?.prompt || education?.title || "Here’s an update:";
        }

        return mapped;
      });
  }, [agentMessages]);

  const isLoading = status === "streaming" || status === "connecting";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/10 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Camera & Creator Gear</h1>
              <p className="text-xs text-slate-400">Your shopping assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TTSToggle />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>AI-Powered</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 scroll-smooth">
          <Chat messages={mappedMessages} isLoading={isLoading} onChipSelect={handleChipSelect} />
        </div>

        <div className="border-t border-white/5 bg-black/30 backdrop-blur-xl p-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading} />
            
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell me what you're looking for..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-12 text-white placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 transition-all"
              />
            </div>
            
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
              className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 shadow-lg transition-all flex items-center justify-center"
            >
              {isLoading ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
          
          {mappedMessages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {["I need a camera for travel vlogging", "Help me pick a lens", "Find a camera under ₹50000"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInputValue(s)}
                  className="text-sm px-4 py-2 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
