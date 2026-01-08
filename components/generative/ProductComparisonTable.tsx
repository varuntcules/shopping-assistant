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
      {summary && <p className="text-slate-200">{summary}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-white font-semibold">{item.title}</div>
                {item.price && <div className="text-violet-300 text-sm">{item.price}</div>}
              </div>
              {item.badges && item.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {item.badges.map((b, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-100"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {item.specs && (
              <div className="text-sm text-slate-200 space-y-1">
                {Object.entries(item.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {item.pros && item.pros.length > 0 && (
              <div>
                <div className="text-xs uppercase text-emerald-300/80 font-semibold mb-1">Pros</div>
                <ul className="list-disc list-inside text-slate-100 text-sm space-y-1">
                  {item.pros.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {item.cons && item.cons.length > 0 && (
              <div>
                <div className="text-xs uppercase text-rose-300/80 font-semibold mb-1">Cons</div>
                <ul className="list-disc list-inside text-slate-100 text-sm space-y-1">
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


