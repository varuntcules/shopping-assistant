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
          .map((part) => {
            if (part.type === "text" && "text" in part) {
              return part.text;
            }
            return "";
          })
          .join("\n\n");

        const generatedUI: GeneratedUIBlock[] = [];

        const mapped: ChatMessage = {
          role: msg.role === "user" ? "user" : "assistant",
          content: textParts,
          generatedUI,
        };

        for (const part of msg.parts) {
          // Type guard for tool parts with state
          const isToolPart = (p: typeof part): p is typeof part & { type: string; state?: string; output?: unknown; result?: unknown; data?: unknown } => {
            return typeof p === "object" && p !== null && "type" in p && typeof p.type === "string";
          };

          if (!isToolPart(part)) continue;

          if (part.type === "tool-retail_assistant" && part.state === "output-available") {
            const output = part.output as {
              message?: string;
              products?: Array<{
                productId?: number | string;
                id?: number | string;
                variantId?: number | string;
                title?: string;
                handle?: string;
                price?: number;
                price_min?: number;
                imageUrl?: string;
              }>;
              collectedInfo?: {
                product_type?: string;
              };
              ui?: {
                type?: "question" | "recommendation" | "comparison" | "checkout" | "confirmation" | "recovery";
                chips?: string[];
                comparison?: unknown;
                checkout?: unknown;
              };
              uiBlock?: GeneratedUIBlock;
            } | undefined;

            if (output) {
              mapped.content = output.message || textParts || "Here are some options:";
              mapped.products =
                output.products?.map((p) => ({
                  id: String(p.productId ?? p.id ?? p.variantId ?? crypto.randomUUID()),
                  title: p.title ?? "Product",
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
              const ui: ChatMessage["ui"] = {
                layout: "grid",
                title: output.ui?.type === "recommendation" ? "Recommended Products" : "",
                mode: output.ui?.type === "question" ? "education" : "shopping",
              };
              if (output.ui && output.ui.type) {
                ui.retailUI = output.ui as NonNullable<ChatMessage["ui"]>["retailUI"];
              }
              mapped.ui = ui;
              mapped.confidence = output.products?.length ? 0.75 : undefined;

              // If retail tool also wants to surface a generative block, honor it
              if (output.uiBlock) {
                generatedUI.push(output.uiBlock);
              }
            }
          }

          // Handle generative UI tool outputs
          if (part.type?.startsWith("tool-") && part.state === "output-available") {
            const output = (part.output || part.result || part.data) as {
              uiBlock?: GeneratedUIBlock;
              uiBlocks?: GeneratedUIBlock[];
            } | undefined;

            if (output?.uiBlock) {
              generatedUI.push(output.uiBlock);
            } else if (Array.isArray(output?.uiBlocks)) {
              generatedUI.push(...output.uiBlocks);
            }
          }
        }

        // If we have no text content but a question block, use its prompt for the bubble
        if (!mapped.content && generatedUI.length > 0) {
          const question = generatedUI.find((b) => b.kind === "question");
          const education = generatedUI.find((b) => b.kind === "education");
          if (question && question.kind === "question") {
            mapped.content = question.prompt || "Here's an update:";
          } else if (education && education.kind === "education") {
            mapped.content = education.title || "Here's an update:";
          } else {
            mapped.content = "Here's an update:";
          }
        }

        return mapped;
      });
  }, [agentMessages]);

  const isLoading = status === "streaming";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Camera & Creator Gear</h1>
              <p className="text-xs text-muted-foreground">Your shopping assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TTSToggle />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span>Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-3xl mx-auto w-full">
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 scroll-smooth">
          <Chat messages={mappedMessages} isLoading={isLoading} onChipSelect={handleChipSelect} />
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-card p-4">
          <form onSubmit={handleSubmit} className="flex items-center justify-center gap-3">
            <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading} />
            
            <div className="flex-1 relative h-fit" style={{ lineHeight: '120%', verticalAlign: 'top' }}>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell me what you're looking for..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-background border border-input rounded-xl px-4 py-3 pr-12 text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 transition-all text-[15px]"
              />
            </div>
            
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              aria-label="Send message"
              className="shrink-0 w-11 h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
          
          {/* Starter chips - only show when no messages */}
          {mappedMessages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {["I need a camera for travel vlogging", "Help me pick a lens", "Find a camera under ₹50000"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInputValue(s)}
                  className="text-sm px-4 py-2 rounded-full bg-secondary border border-border text-secondary-foreground hover:border-primary/30 hover:bg-secondary/80 transition-colors"
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
