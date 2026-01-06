"use client";

interface CenterEmptyStateProps {
  isVisible: boolean;
}

export default function CenterEmptyState({ isVisible }: CenterEmptyStateProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 z-10 animate-fadeIn">
      <div className="text-center space-y-3 max-w-sm">
        <h1 className="text-5xl font-light text-white/90 leading-tight tracking-tight">
          I&apos;m here to help you
        </h1>
        <p className="text-base text-white/50 font-normal leading-relaxed mt-2">
          Ask anything to start the conversation
        </p>
      </div>
    </div>
  );
}





