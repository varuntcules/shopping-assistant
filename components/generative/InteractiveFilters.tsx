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
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
      {heading && <div className="text-sm font-semibold text-white/90">{heading}</div>}

      {chips && chips.length > 0 && (
        <QuickChips options={chips} onSelect={handleSelect} />
      )}

      {ranges && ranges.length > 0 && (
        <div className="grid gap-2 text-sm text-slate-200">
          {ranges.map((range, idx) => (
            <button
              key={idx}
              className="text-left px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-violet-400/40 transition"
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
                <span className="text-slate-400 ml-1">
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


