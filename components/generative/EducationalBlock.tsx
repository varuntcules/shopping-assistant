"use client";

interface EducationalBlockProps {
  title?: string;
  body?: string;
  bullets?: string[];
  sections?: Array<{ title: string; description: string }>;
}

export function EducationalBlock({ title, body, bullets, sections }: EducationalBlockProps) {
  return (
    <div className="rounded-xl border border-warning/20 bg-warning/5 p-5 space-y-4">
      {title && (
        <div className="flex items-center gap-3 pb-3 border-b border-warning/20">
          <div className="w-8 h-8 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
      )}
      
      {body && (
        <div>
          <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      )}
      
      {sections && sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-card rounded-lg p-4 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-2">{section.title}</h4>
              <p className="text-muted-foreground text-sm leading-relaxed">{section.description}</p>
            </div>
          ))}
        </div>
      )}
      
      {bullets && bullets.length > 0 && (
        <div className="bg-card rounded-lg p-4 border border-border">
          <ul className="list-none space-y-2">
            {bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2 text-muted-foreground text-sm">
                <span className="text-warning mt-0.5">•</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
