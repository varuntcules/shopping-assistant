"use client";

import QuickChips from "../QuickChips";

interface FilterRange {
  label: string;
  min?: number;
  max?: number;
}

interface InteractiveFiltersProps {
  heading?: string;
  chips?: string[];
  ranges?: FilterRange[];
  onSelect?: (value: string) => void;
}

export function InteractiveFilters({ heading, chips, ranges, onSelect }: InteractiveFiltersProps) {
  const handleSelect = (value: string) => {
    onSelect?.(value);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      {heading && <div className="text-sm font-semibold text-foreground">{heading}</div>}

      {chips && chips.length > 0 && (
        <QuickChips options={chips} onSelect={handleSelect} />
      )}

      {ranges && ranges.length > 0 && (
        <div className="grid gap-2 text-sm">
          {ranges.map((range, idx) => (
            <button
              key={idx}
              className="text-left px-3 py-2 rounded-lg bg-secondary border border-border text-secondary-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => {
                const label =
                  range.min !== undefined || range.max !== undefined
                    ? `${range.label} (${range.min ?? 0} - ${range.max ?? "∞"})`
                    : range.label;
                handleSelect(label);
              }}
            >
              {range.label}
              {range.min !== undefined || range.max !== undefined ? (
                <span className="text-muted-foreground ml-1">
                  ({range.min ?? 0} - {range.max ?? "∞"})
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
