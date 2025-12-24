"use client";

interface QuickChipsProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export default function QuickChips({ options, onSelect, disabled }: QuickChipsProps) {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          disabled={disabled}
          className="px-4 py-2 rounded-full
                   bg-white/5 border border-white/10
                   text-slate-300 hover:text-white
                   hover:bg-white/10 hover:border-violet-500/30
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 text-sm font-medium"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

