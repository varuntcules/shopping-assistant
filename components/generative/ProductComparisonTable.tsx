"use client";

interface ComparisonItem {
  title: string;
  price?: string;
  imageUrl?: string | null;
  badges?: string[];
  specs?: Record<string, string>;
  pros?: string[];
  cons?: string[];
}

interface ProductComparisonTableProps {
  items: ComparisonItem[];
  summary?: string;
}

export function ProductComparisonTable({ items, summary }: ProductComparisonTableProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      {summary && <p className="text-muted-foreground text-sm">{summary}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-foreground font-semibold">{item.title}</div>
                {item.price && <div className="text-primary text-sm font-medium">{item.price}</div>}
              </div>
              {item.badges && item.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {item.badges.map((b, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {item.specs && (
              <div className="text-sm space-y-1">
                {Object.entries(item.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-foreground font-medium">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {item.pros && item.pros.length > 0 && (
              <div>
                <div className="text-xs uppercase text-success font-semibold mb-1">Pros</div>
                <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1">
                  {item.pros.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {item.cons && item.cons.length > 0 && (
              <div>
                <div className="text-xs uppercase text-destructive font-semibold mb-1">Cons</div>
                <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1">
                  {item.cons.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
