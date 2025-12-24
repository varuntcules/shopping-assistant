"use client";

import { ChatMessage, UIMode, AssistantUIModel } from "@/lib/types";
import ProductGrid from "./ProductGrid";
import QuickChips from "./QuickChips";
import ProductComparison from "./ProductComparison";
import CheckoutView from "./CheckoutView";
import { useState } from "react";

interface ChatProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onChipSelect?: (chip: string) => void;
}

export default function Chat({ messages, isLoading, onChipSelect }: ChatProps) {
  return (
    <div className="flex flex-col gap-6 py-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 mb-6 rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white/90 mb-2">Your Personal Shopping Guide</h2>
          <p className="text-slate-400 max-w-md">
            I&apos;ll help you find the perfect product. Tell me what you&apos;re looking for and I&apos;ll guide you through the options, explain tradeoffs, and show you the best matches.
          </p>
        </div>
      )}

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
            />
          )}
        </div>
      ))}

      {isLoading && (
        <div className="flex items-start gap-4 animate-fadeIn">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl rounded-tl-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-slate-400 text-sm">Thinking...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-4 justify-end">
      <div className="flex-1 max-w-[80%] bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 backdrop-blur-sm border border-violet-500/20 rounded-2xl rounded-tr-sm p-4 ml-auto">
        <p className="text-white">{content}</p>
      </div>
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  onChipSelect
}: { 
  content: string; 
  products?: ChatMessage["products"];
  uiTitle?: string;
  mode?: UIMode;
  retailUI?: AssistantUIModel["retailUI"];
  confidence?: number;
  onChipSelect?: (chip: string) => void;
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
    <div className="flex items-start gap-4">
      {/* Avatar - changes based on mode */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
        isEducationMode 
          ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/30" 
          : "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-violet-500/30"
      }`}>
        {isEducationMode ? (
          // Lightbulb icon for education/guidance mode
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ) : (
          // Lightning bolt for shopping mode
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
      
      <div className="flex-1 space-y-4">
        {/* Message bubble - styled differently for education mode */}
        <div className={`backdrop-blur-sm rounded-2xl rounded-tl-sm p-4 relative ${
          isEducationMode 
            ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20" 
            : "bg-white/5 border border-white/10"
        }`}>
          {/* Confidence badge */}
          {confidence !== undefined && (
            <div className="absolute top-3 right-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  confidence >= 0.7 ? "bg-emerald-400" :
                  confidence >= 0.4 ? "bg-amber-400" :
                  "bg-red-400"
                }`} />
                <span className="text-xs font-medium text-slate-300">
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            </div>
          )}
          
          {/* Education mode indicator */}
          {isEducationMode && !products?.length && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-500/20">
              <span className="text-xs font-medium text-amber-400/80 uppercase tracking-wide">
                💡 Let me help you decide
              </span>
            </div>
          )}
          
          {/* Render paragraphs */}
          <div className="space-y-3">
            {paragraphs.map((paragraph, idx) => (
              <p key={idx} className="text-white/90 leading-relaxed">{paragraph}</p>
            ))}
          </div>
        </div>
        
        {/* Quick chips for selection */}
        {retailUI?.chips && retailUI.chips.length > 0 && (
          <QuickChips 
            options={retailUI.chips} 
            onSelect={handleChipClick}
          />
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
        {products && products.length > 0 && (
          <ProductGrid products={products} title={uiTitle} />
        )}
      </div>
    </div>
  );
}

