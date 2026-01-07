import { motion } from 'framer-motion';
import { X, Square, ArrowDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IOSInstallGuideProps {
  onClose: () => void;
}

export default function IOSInstallGuide({ onClose }: IOSInstallGuideProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Install Welile.com</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-sm mx-auto space-y-8">
          {/* App preview */}
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden shadow-xl mb-4">
              <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
            </div>
            <h3 className="text-xl font-bold">Welile.com</h3>
            <p className="text-muted-foreground text-sm mt-1">Rent Facilitation Platform</p>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            <h4 className="font-semibold text-center">Follow these 3 easy steps:</h4>
            
            {/* Step 1 */}
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-start gap-4 p-4 bg-primary/5 rounded-xl border border-primary/20"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="font-medium mb-2">Tap the Share button</p>
                <div className="flex items-center gap-2 text-primary">
                  <div className="p-2 bg-primary/10 rounded-lg flex flex-col items-center">
                    <Square className="h-5 w-5" strokeWidth={1.5} />
                    <ArrowDown className="h-3 w-3 -mt-1" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Look for <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/20 text-blue-600 rounded text-xs font-medium">Share</span> in Safari toolbar
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Step 2 */}
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-start gap-4 p-4 bg-primary/5 rounded-xl border border-primary/20"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="font-medium mb-2">Scroll and tap "Add to Home Screen"</p>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Add to Home Screen</span>
                </div>
              </div>
            </motion.div>

            {/* Step 3 */}
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-start gap-4 p-4 bg-primary/5 rounded-xl border border-primary/20"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="font-medium mb-2">Tap "Add" in the top right</p>
                <span className="text-sm text-muted-foreground">That's it! Welile will appear on your home screen</span>
              </div>
            </motion.div>
          </div>

          {/* Benefits */}
          <div className="bg-muted/50 rounded-xl p-4">
            <h5 className="font-medium mb-2 text-sm">Why install?</h5>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✓ Faster access from home screen</li>
              <li>✓ Works offline</li>
              <li>✓ Full-screen experience</li>
              <li>✓ Get notifications</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer with clear CTA */}
      <div className="p-4 border-t bg-primary/5">
        <div className="max-w-sm mx-auto text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Look for the <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-500/20 text-blue-600 rounded text-xs font-medium mx-1">
              <Square className="h-3 w-3 mr-0.5" strokeWidth={1.5} />
              <ArrowDown className="h-2 w-2" />
            </span> Share icon in Safari
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClose}
            className="text-xs"
          >
            I'll do this later
          </Button>
        </div>
      </div>
    </motion.div>
  );
}