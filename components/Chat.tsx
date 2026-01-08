"use client";

import { ChatMessage, UIMode, AssistantUIModel, GeneratedUIBlock } from "@/lib/types";
import ProductGrid from "./ProductGrid";
import QuickChips from "./QuickChips";
import ProductComparison from "./ProductComparison";
import CheckoutView from "./CheckoutView";
import { CustomProductGrid } from "./generative/CustomProductGrid";
import { EducationalBlock } from "./generative/EducationalBlock";
import { ProductComparisonTable } from "./generative/ProductComparisonTable";
import { InteractiveFilters } from "./generative/InteractiveFilters";
import { DynamicQuestion } from "./generative/DynamicQuestion";
import { useState, useEffect, useRef } from "react";
import { useTextToSpeech } from "@/lib/useTextToSpeech";
import { formatMessageForTTS } from "@/lib/formatProductText";

interface ChatProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onChipSelect?: (chip: string) => void;
}

export default function Chat({ messages, isLoading, onChipSelect }: ChatProps) {
  const { speak, isEnabled } = useTextToSpeech();
  const lastSpokenIndexRef = useRef<number>(-1);

  // Auto-speak new assistant messages when TTS is enabled
  useEffect(() => {
    if (!isEnabled || isLoading) {
      return;
    }

    // Find the last assistant message that hasn't been spoken yet
    for (let i = messages.length - 1; i > lastSpokenIndexRef.current; i--) {
      const message = messages[i];
      if (message.role === "assistant") {
        const textToSpeak = formatMessageForTTS(message);
        if (textToSpeak && textToSpeak.trim()) {
          speak(textToSpeak);
          lastSpokenIndexRef.current = i;
          break;
        }
      }
    }
  }, [messages, isLoading, isEnabled, speak]);

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* Empty state */}
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center">
          {/* Simple accent circle */}
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-8">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          
          <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-3 animate-fadeIn">
            What can I help you find?
          </h1>
          
          <p className="text-base text-muted-foreground mb-8 animate-fadeIn max-w-md" style={{ animationDelay: "0.1s" }}>
            Tell me what you're looking for. I'll help you find the perfect camera or gear.
          </p>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-fadeIn" style={{ animationDelay: "0.2s" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>Voice mode available</span>
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((message, index) => (
        <div key={index} className="animate-fadeIn">
          {message.role === "user" ? (
            <UserMessage content={message.content} />
          ) : (
            <AssistantMessage 
              content={message.content} 
              products={message.products}
              uiTitle={message.ui?.title}
              mode={message.ui?.mode}
              retailUI={message.ui?.retailUI}
              confidence={message.confidence}
              onChipSelect={onChipSelect}
              generatedUI={message.generatedUI}
            />
          )}
        </div>
      ))}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-start gap-3 animate-fadeIn">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 bg-card border border-border rounded-2xl rounded-tl-md p-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-muted-foreground text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="flex-1 max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-md p-4 ml-auto">
        <p className="text-[15px] leading-relaxed">{content}</p>
      </div>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center">
        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>
  );
}

function AssistantMessage({ 
  content, 
  products,
  uiTitle,
  mode = "shopping",
  retailUI,
  confidence,
  onChipSelect,
  generatedUI
}: { 
  content: string; 
  products?: ChatMessage["products"];
  uiTitle?: string;
  mode?: UIMode;
  retailUI?: AssistantUIModel["retailUI"];
  confidence?: number;
  onChipSelect?: (chip: string) => void;
  generatedUI?: GeneratedUIBlock[];
}) {
  const isEducationMode = mode === "education" || (!products || products.length === 0);
  
  // Split content by double newlines to render paragraphs properly
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  
  const handleChipClick = (chip: string) => {
    if (onChipSelect) {
      onChipSelect(chip);
    }
  };
  
  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
        isEducationMode 
          ? "bg-warning/10 border-warning/20" 
          : "bg-primary/10 border-primary/20"
      }`}>
        {isEducationMode ? (
          <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
      
      <div className="flex-1 space-y-4 min-w-0">
        {/* Message bubble */}
        <div className={`rounded-2xl rounded-tl-md p-4 relative ${
          isEducationMode 
            ? "bg-warning/5 border border-warning/20" 
            : "bg-card border border-border"
        }`}>
          {/* Confidence badge */}
          {confidence !== undefined && (
            <div className="absolute top-3 right-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted border border-border">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  confidence >= 0.7 ? "bg-success" :
                  confidence >= 0.4 ? "bg-warning" :
                  "bg-destructive"
                }`} />
                <span className="text-xs font-medium text-muted-foreground">
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            </div>
          )}
          
          {/* Education mode label */}
          {isEducationMode && !products?.length && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-warning/20">
              <span className="text-xs font-medium text-warning uppercase tracking-wide">
                Let me help you decide
              </span>
            </div>
          )}
          
          {/* Render paragraphs */}
          <div className="space-y-3 pr-16">
            {paragraphs.map((paragraph, idx) => (
              <p key={idx} className="text-foreground text-[15px] leading-relaxed">{paragraph}</p>
            ))}
          </div>
        </div>

        {/* Render generative UI blocks */}
        {generatedUI && generatedUI.length > 0 && (
          <div className="space-y-4">
            {generatedUI.map((block, idx) => (
              <GeneratedUIRenderer key={idx} block={block} onChipSelect={onChipSelect} />
            ))}
          </div>
        )}
        
        {/* Legacy retailUI support */}
        {(!generatedUI || generatedUI.length === 0) && (
          <>
            {retailUI?.chips && retailUI.chips.length > 0 && (
              <QuickChips 
                options={retailUI.chips} 
                onSelect={handleChipClick}
              />
            )}
          </>
        )}
        
        {/* Product comparison */}
        {retailUI?.comparison && retailUI.comparison.productA && retailUI.comparison.productB && (
          <ProductComparison
            productA={retailUI.comparison.productA}
            productB={retailUI.comparison.productB}
            tradeoffs={retailUI.comparison.tradeoffs}
          />
        )}
        
        {/* Checkout view */}
        {retailUI?.checkout && (
          <CheckoutView
            items={retailUI.checkout.items}
            total={retailUI.checkout.total}
            onConfirm={() => console.log("Order confirmed")}
            onCancel={() => console.log("Order cancelled")}
          />
        )}
        
        {/* Product grid */}
        {products && products.length > 0 && 
         !generatedUI?.some(block => block.kind === "productGrid") && (
          <ProductGrid products={products} title={uiTitle} />
        )}
      </div>
    </div>
  );
}

function GeneratedUIRenderer({
  block,
  onChipSelect,
}: {
  block: GeneratedUIBlock;
  onChipSelect?: (chip: string) => void;
}) {
  switch (block.kind) {
    case "education":
      return (
        <EducationalBlock
          title={block.title}
          body={block.body}
          sections={block.sections}
          bullets={block.bullets}
        />
      );
    case "comparison":
      return <ProductComparisonTable items={block.items} summary={block.summary} />;
    case "filters":
      return (
        <InteractiveFilters
          heading={block.heading}
          chips={block.chips}
          ranges={block.ranges}
          onSelect={onChipSelect}
        />
      );
    case "productGrid":
      return <CustomProductGrid title={block.title} products={block.products} />;
    case "question":
      return (
        <DynamicQuestion prompt={block.prompt} chips={block.chips} onSelect={onChipSelect} />
      );
    default:
      return null;
  }
}
