import { motion } from 'framer-motion';
import { 
  Skeleton, 
  SkeletonMetricCard, 
  SkeletonWallet, 
  SkeletonListItem,
  SkeletonChart 
} from '@/components/ui/skeleton';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function DashboardHeaderSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-4 border-b border-border/50 bg-card/50 backdrop-blur-sm"
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
