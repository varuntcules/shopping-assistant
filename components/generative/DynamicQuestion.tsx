"use client";

import QuickChips from "../QuickChips";

interface DynamicQuestionProps {
  prompt: string;
  chips?: string[];
  onSelect?: (value: string) => void;
}

export function DynamicQuestion({ prompt, chips, onSelect }: DynamicQuestionProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
      <div className="text-white/90">{prompt}</div>
      {chips && chips.length > 0 && (
        <QuickChips options={chips} onSelect={(v) => onSelect?.(v)} />
      )}
    </div>
  );
}


