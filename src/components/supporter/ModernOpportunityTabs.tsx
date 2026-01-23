import { motion } from 'framer-motion';
import { TrendingUp, History, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModernOpportunityTabsProps {
  activeTab: 'opportunities' | 'funded';
  onTabChange: (tab: 'opportunities' | 'funded') => void;
  opportunityCount?: number;
  fundedCount?: number;
}

export function ModernOpportunityTabs({
  activeTab,
  onTabChange,
  opportunityCount = 0,
  fundedCount = 0,
}: ModernOpportunityTabsProps) {
  const tabs = [
    {
      id: 'opportunities' as const,
      label: 'Opportunities',
      icon: TrendingUp,
      count: opportunityCount,
      activeColor: 'bg-primary text-white',
    },
    {
      id: 'funded' as const,
      label: 'My Funded',
      icon: CheckCircle2,
      count: fundedCount,
      activeColor: 'bg-emerald-500 text-white',
    },
  ];

  return (
    <div className="bg-muted/40 p-1.5 rounded-2xl">
      <div className="grid grid-cols-2 gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-300 touch-manipulation',
                isActive
                  ? tab.activeColor + ' shadow-lg'
                  : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <motion.span
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    'ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full',
                    isActive
                      ? 'bg-white/25'
                      : 'bg-primary/15 text-primary'
                  )}
                >
                  {tab.count > 99 ? '99+' : tab.count}
                </motion.span>
              )}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-xl -z-10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
