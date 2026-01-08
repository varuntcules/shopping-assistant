"use client";

import QuickChips from "../QuickChips";

interface DynamicQuestionProps {
  prompt: string;
  chips?: string[];
  onSelect?: (value: string) => void;
}

export function DynamicQuestion({ prompt, chips, onSelect }: DynamicQuestionProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="text-foreground text-[15px]">{prompt}</div>
      {chips && chips.length > 0 && (
        <QuickChips options={chips} onSelect={(v) => onSelect?.(v)} />
      )}
    </div>
  );
}
