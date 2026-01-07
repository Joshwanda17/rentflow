import { motion } from 'framer-motion';
import { 
  Skeleton, 
  SkeletonMetricCard, 
  SkeletonWallet, 
  SkeletonListItem,
  SkeletonChart,
  SkeletonProductGrid,
  SkeletonTransactionList,
  SkeletonTable
} from '@/components/ui/skeleton';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export function DashboardHeaderSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </motion.div>
  );
}

export function TenantDashboardSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp}>
        <SkeletonWallet />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </motion.div>
    </motion.div>
  );
}

export function AgentDashboardSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp}>
        <SkeletonChart />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </motion.div>
    </motion.div>
  );
}

export function ManagerDashboardSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="grid md:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </motion.div>
    </motion.div>
  );
}

export function SupporterDashboardSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp}>
        <SkeletonWallet />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </motion.div>
    </motion.div>
  );
}

export function LandlordDashboardSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp}>
        <SkeletonWallet />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </motion.div>
    </motion.div>
  );
}

// Marketplace skeleton
export function MarketplaceSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-6 p-4"
    >
      {/* Search and filter bar */}
      <motion.div variants={fadeInUp} className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </motion.div>
      
      {/* Category tabs */}
      <motion.div variants={fadeInUp} className="flex gap-2 overflow-hidden">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-18 rounded-full" />
        <Skeleton className="h-9 w-22 rounded-full" />
      </motion.div>
      
      {/* Product grid */}
      <motion.div variants={fadeInUp}>
        <SkeletonProductGrid count={8} />
      </motion.div>
    </motion.div>
  );
}

// Cart skeleton
export function CartSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-4 p-4"
    >
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          variants={fadeInUp}
          className="flex gap-3 p-3 rounded-xl bg-card border border-border/50"
        >
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </div>
          <Skeleton className="h-5 w-20" />
        </motion.div>
      ))}
      
      {/* Order summary */}
      <motion.div variants={fadeInUp} className="pt-4 border-t border-border/50 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
      </motion.div>
    </motion.div>
  );
}

// Settings page skeleton
export function SettingsSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      {/* Profile section */}
      <motion.div variants={fadeInUp} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-20 rounded-lg" />
      </motion.div>
      
      {/* Settings sections */}
      {[...Array(4)].map((_, i) => (
        <motion.div key={i} variants={fadeInUp} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="rounded-xl bg-card border border-border divide-y divide-border">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// Receipts page skeleton
export function ReceiptsSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      {/* Stats cards */}
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      {/* Action buttons */}
      <motion.div variants={fadeInUp} className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </motion.div>
      
      {/* Receipt list */}
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-28" />
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border"
          >
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-5 w-20 ml-auto" />
              <Skeleton className="h-4 w-16 ml-auto rounded-full" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// Loans page skeleton
export function LoansSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      {/* Loan summary */}
      <motion.div variants={fadeInUp} className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-4">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      </motion.div>
      
      {/* Progress bar */}
      <motion.div variants={fadeInUp} className="space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
      </motion.div>
      
      {/* Loan list */}
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-28" />
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-xl bg-card border border-border space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// Transaction history skeleton
export function TransactionHistorySkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      {/* Filter tabs */}
      <motion.div variants={fadeInUp} className="flex gap-2 overflow-x-auto pb-2">
        <Skeleton className="h-9 w-16 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </motion.div>
      
      {/* Date groups */}
      {[...Array(3)].map((_, groupIndex) => (
        <motion.div key={groupIndex} variants={fadeInUp} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <SkeletonTransactionList count={3} />
        </motion.div>
      ))}
    </motion.div>
  );
}

// Referrals page skeleton
export function ReferralsSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      {/* Stats overview */}
      <motion.div variants={fadeInUp} className="grid grid-cols-3 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      {/* Share card */}
      <motion.div variants={fadeInUp} className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
      </motion.div>
      
      {/* Referral list */}
      <motion.div variants={fadeInUp} className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {[...Array(5)].map((_, i) => (
          <SkeletonListItem key={i} />
        ))}
      </motion.div>
      
      {/* Leaderboard */}
      <motion.div variants={fadeInUp}>
        <Skeleton className="h-5 w-28 mb-3" />
        <SkeletonTable rows={5} />
      </motion.div>
    </motion.div>
  );
}

// Generic page skeleton
export function PageSkeleton() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="min-h-screen bg-background p-4 space-y-6"
    >
      <DashboardHeaderSkeleton />
      
      <motion.div variants={fadeInUp} className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </motion.div>
      
      <motion.div variants={fadeInUp} className="space-y-3">
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
        <SkeletonListItem />
      </motion.div>
    </motion.div>
  );
}
