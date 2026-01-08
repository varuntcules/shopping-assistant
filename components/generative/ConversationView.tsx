"use client";

import { ChatMessage } from "@/lib/types";
import { useEffect, useRef } from "react";

interface ConversationViewProps {
  messages: ChatMessage[];
  onOptionClick?: (option: string) => void;
}

export default function ConversationView({ messages, onOptionClick }: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto px-4 py-6" style={{ gap: "24px" }}>
      {messages.map((message, index) => (
        <div key={index} className="animate-fadeIn">
          {message.role === "user" ? (
            <UserMessageBubble content={message.content} />
          ) : (
            <AssistantMessageBubble 
              content={message.content} 
              mode={message.ui?.mode}
              onOptionClick={onOptionClick}
            />
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

function UserMessageBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div 
        className="max-w-[80%] rounded-2xl rounded-tr-sm p-4"
        style={{
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)",
          border: "1px solid rgba(139, 92, 246, 0.2)",
          backdropFilter: "blur(8px)",
        }}
      >
        <p className="text-white text-[15px] leading-relaxed">{content}</p>
      </div>
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgba(71, 85, 105, 0.8) 0%, rgba(51, 65, 85, 0.8) 100%)",
        }}
      >
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>
  );
}

function AssistantMessageBubble({ 
  content, 
  mode,
  onOptionClick 
}: { 
  content: string; 
  mode?: "education" | "shopping";
  onOptionClick?: (option: string) => void;
}) {
  const isEducationMode = mode === "education";
  
  // Parse content for educational options (lines starting with ** or bullet points)
  const parseContent = (text: string) => {
    const lines = text.split('\n');
    const paragraphs: string[] = [];
    const options: string[] = [];
    let currentParagraph = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if it's a bold option (starts with **)
      if (trimmed.startsWith('**') && (trimmed.includes('**') || trimmed.length > 2)) {
        if (currentParagraph) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        // Extract option text (remove ** and parentheses)
        const optionText = trimmed
          .replace(/\*\*/g, '')
          .replace(/\s*\([^)]*\)\s*$/g, '')
          .replace(/^\*\s*/, '')
          .trim();
        if (optionText) {
          options.push(optionText);
        }
      } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // Bullet point
        if (currentParagraph) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        paragraphs.push(trimmed);
      } else if (trimmed) {
        currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
      }
    }
    
    if (currentParagraph) {
      paragraphs.push(currentParagraph.trim());
    }
    
    return { paragraphs, options };
  };

  const { paragraphs, options } = parseContent(content);

  return (
    <div className="flex items-start gap-3">
      {/* Avatar - Lightbulb for education, Lightning for shopping */}
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: isEducationMode
            ? "linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(249, 115, 22, 0.9) 100%)"
            : "linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(168, 85, 247, 0.9) 100%)",
          boxShadow: isEducationMode
            ? "0 0 20px rgba(245, 158, 11, 0.3)"
            : "0 0 20px rgba(139, 92, 246, 0.3)",
        }}
      >
        {isEducationMode ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>
      
      <div className="flex-1 space-y-3">
        {/* Education mode header */}
        {isEducationMode && (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}
          >
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              💡 Let me help you decide
            </span>
          </div>
        )}
        
        {/* Message bubble */}
        <div 
          className="rounded-2xl rounded-tl-sm p-4"
          style={{
            background: isEducationMode
              ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%)"
              : "rgba(255, 255, 255, 0.05)",
            border: isEducationMode
              ? "1px solid rgba(245, 158, 11, 0.2)"
              : "1px solid rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Content paragraphs */}
          <div className="space-y-3">
            {paragraphs.map((paragraph, idx) => {
              // Check if it's a bullet point
              if (paragraph.startsWith('-') || paragraph.startsWith('*')) {
                return (
                  <p key={idx} className="text-white/90 text-[15px] leading-relaxed pl-4" style={{ listStyle: "disc" }}>
                    {paragraph.substring(1).trim()}
                  </p>
                );
              }
              return (
                <p key={idx} className="text-white/90 text-[15px] leading-relaxed">
                  {paragraph}
                </p>
              );
            })}
          </div>
          
          {/* Educational options as clickable buttons */}
          {options.length > 0 && (
            <div className="mt-4 space-y-2">
              {options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => onOptionClick?.(option)}
                  className="w-full text-left p-3 rounded-lg transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  <p className="text-white text-[15px] font-medium leading-relaxed">
                    {option}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

