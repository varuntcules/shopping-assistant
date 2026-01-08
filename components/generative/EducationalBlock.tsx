"use client";

interface EducationalBlockProps {
  title?: string;
  body?: string;
  bullets?: string[];
  sections?: Array<{ title: string; description: string }>;
}

export function EducationalBlock({ title, body, bullets, sections }: EducationalBlockProps) {
  return (
    <div className="backdrop-blur-sm rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-orange-500/15 p-6 space-y-4 shadow-lg">
      {title && (
        <div className="flex items-center gap-3 pb-3 border-b border-amber-500/30">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-amber-200">{title}</h3>
        </div>
      )}
      
      {body && (
        <div className="prose prose-invert max-w-none">
          <p className="text-slate-100 leading-relaxed whitespace-pre-wrap text-base">{body}</p>
        </div>
      )}
      
      {sections && sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-black/20 rounded-lg p-4 border border-amber-500/20">
              <h4 className="text-base font-semibold text-amber-300 mb-2">{section.title}</h4>
              <p className="text-slate-200 leading-relaxed">{section.description}</p>
            </div>
          ))}
        </div>
      )}
      
      {bullets && bullets.length > 0 && (
        <div className="bg-black/20 rounded-lg p-4 border border-amber-500/20">
          <ul className="list-none space-y-2">
            {bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-200">
                <span className="text-amber-400 mt-1">•</span>
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

