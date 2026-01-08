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
    <div className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          disabled={disabled}
          className="px-4 py-2 rounded-full
                   bg-secondary border border-border
                   text-secondary-foreground text-sm font-medium
                   hover:border-primary/30 hover:bg-primary/5
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors duration-150"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
