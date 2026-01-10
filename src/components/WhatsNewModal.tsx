import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Rocket, Bug, Zap, Star, Gift } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

declare const __APP_VERSION__: string;

interface ChangelogEntry {
  version: string;
  date: string;
  highlights?: string;
  changes: {
    type: "feature" | "improvement" | "fix" | "new";
    title: string;
    description?: string;
  }[];
}

// Add new entries at the top - most recent first
const changelog: ChangelogEntry[] = [
  {
    version: __APP_VERSION__,
    date: new Date().toLocaleDateString("en-UG", { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    }),
    highlights: "Auto-updates & Payment Streak Calendar",
    changes: [
      {
        type: "new",
        title: "Automatic App Updates",
        description: "Your app now updates automatically when new features are released. No more manual refreshes!",
      },
      {
        type: "feature",
        title: "Payment Streak Calendar",
        description: "Track your daily payment streak with a beautiful color-coded calendar view.",
      },
      {
        type: "feature",
        title: "Payment Reminders",
        description: "Get notified before end of day to maintain your payment streak.",
      },
      {
        type: "improvement",
        title: "Faster Performance",
        description: "Optimized loading times and smoother animations across the app.",
      },
    ],
  },
];

const getIcon = (type: string) => {
  switch (type) {
    case "new":
      return <Sparkles className="h-4 w-4" />;
    case "feature":
      return <Rocket className="h-4 w-4" />;
    case "improvement":
      return <Zap className="h-4 w-4" />;
    case "fix":
      return <Bug className="h-4 w-4" />;
    default:
      return <Star className="h-4 w-4" />;
  }
};

const getBadgeVariant = (type: string) => {
  switch (type) {
    case "new":
      return "default";
    case "feature":
      return "secondary";
    case "improvement":
      return "outline";
    case "fix":
      return "destructive";
    default:
      return "outline";
  }
};

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const [currentEntry] = useState(changelog[0]);

  useEffect(() => {
    const lastSeenVersion = localStorage.getItem("welile_last_seen_version");
    const currentVersion = __APP_VERSION__;

    // Show modal if version changed or never seen
    if (lastSeenVersion !== currentVersion) {
      // Small delay to let the app settle after update
      const timer = setTimeout(() => {
        setOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("welile_last_seen_version", __APP_VERSION__);
    setOpen(false);
  };

  if (!currentEntry) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <motion.div
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 10 }}
              >
                <Gift className="h-8 w-8 text-primary" />
              </motion.div>
              <DialogTitle className="text-2xl font-bold">
                What's New
              </DialogTitle>
            </div>
            <DialogDescription className="text-left">
              {currentEntry.highlights && (
                <span className="font-medium text-foreground">
                  {currentEntry.highlights}
                </span>
              )}
              <span className="block text-xs text-muted-foreground mt-1">
                Updated {currentEntry.date}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[50vh] px-6">
          <AnimatePresence>
            <div className="space-y-4 pb-2">
              {currentEntry.changes.map((change, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-3"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Badge 
                      variant={getBadgeVariant(change.type)}
                      className="h-7 w-7 rounded-full p-0 flex items-center justify-center"
                    >
                      {getIcon(change.type)}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{change.title}</p>
                    {change.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {change.description}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </ScrollArea>

        <div className="p-6 pt-4 border-t bg-muted/30">
          <Button onClick={handleClose} className="w-full" size="lg">
            <Sparkles className="h-4 w-4 mr-2" />
            Got it, let's go!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
