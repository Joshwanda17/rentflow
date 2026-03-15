import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureItem {
  title: string;
  description: string;
  icon?: string;
}

interface GuideSection {
  heading: string;
  features: FeatureItem[];
}

interface DashboardGuideProps {
  title: string;
  overview: string;
  sections: GuideSection[];
}

export function DashboardGuide({ title, overview, sections }: DashboardGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title} — Feature Guide</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{overview}</p>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 pb-4 space-y-3">
          {/* Overview */}
          <p className="text-sm text-muted-foreground pt-3 leading-relaxed">{overview}</p>

          {/* Sections */}
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="rounded-xl border border-border/60 overflow-hidden">
              <button
                onClick={() => toggleSection(sIdx)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm font-semibold">{section.heading}</span>
                <span className="text-xs text-muted-foreground">{section.features.length} features</span>
              </button>

              {expandedSections.has(sIdx) && (
                <div className="border-t border-border/60 divide-y divide-border/40">
                  {section.features.map((feature, fIdx) => (
                    <div key={fIdx} className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        {feature.icon && <span className="text-base shrink-0 mt-0.5">{feature.icon}</span>}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{feature.title}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{feature.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
