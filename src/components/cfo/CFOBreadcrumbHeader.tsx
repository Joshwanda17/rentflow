import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { executiveSidebarConfig } from '@/components/layout/executiveSidebarConfig';

// id -> { group, label, icon } from the CFO sidebar (route items excluded).
const SECTION_LOOKUP = Object.fromEntries(
  (executiveSidebarConfig.cfo ?? []).flatMap((section) =>
    section.items
      .filter((item) => !item.route)
      .map((item) => [item.id, { group: section.title, label: item.label, icon: item.icon }]),
  ),
);

/**
 * Breadcrumb header that always shows where the CFO is while drilling into
 * sections. Renders "Dashboard › Group › Section" — the Dashboard crumb jumps
 * back to the overview. Optimised for phones (sticky, single line, truncating).
 */
export function CFOBreadcrumbHeader({
  activeTab,
  onJump,
}: {
  activeTab: string;
  onJump: (tab: string) => void;
}) {
  const meta = SECTION_LOOKUP[activeTab];
  const isOverview = !meta || activeTab === 'overview';
  const Icon = meta?.icon;

  return (
    <nav
      aria-label="Breadcrumb"
      className="-mx-2 sm:-mx-4 lg:-mx-6 mb-1 bg-background border-b border-border"
    >
      <ol className="flex items-center gap-1 px-2 sm:px-4 lg:px-6 py-2 text-sm overflow-x-auto no-scrollbar">
        <li className="shrink-0">
          <button
            type="button"
            onClick={() => {
              hapticTap();
              onJump('overview');
            }}
            className={cn(
              'flex items-center gap-1 font-medium transition-colors',
              isOverview ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            Dashboard
          </button>
        </li>

        {!isOverview && meta && (
          <>
            <li aria-hidden className="shrink-0 text-muted-foreground/60">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="shrink-0 text-muted-foreground whitespace-nowrap hidden sm:inline">
              {meta.group}
            </li>
            <li aria-hidden className="shrink-0 text-muted-foreground/60 hidden sm:inline">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li
              aria-current="page"
              className="flex items-center gap-1.5 font-semibold text-foreground min-w-0"
            >
              {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
              <span className="truncate">{meta.label}</span>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
