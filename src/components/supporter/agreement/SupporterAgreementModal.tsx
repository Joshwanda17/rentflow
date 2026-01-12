import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, Download, Printer, CheckCircle2, AlertCircle, 
  Shield, Clock, ChevronRight, Loader2, FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { QUICK_SUMMARY_CONTENT, FULL_AGREEMENT_CONTENT } from './AgreementContent';
import { cn } from '@/lib/utils';
import { hapticSuccess } from '@/lib/haptics';

interface SupporterAgreementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => Promise<boolean>;
  loading?: boolean;
}

export function SupporterAgreementModal({ 
  open, 
  onOpenChange, 
  onAccept,
  loading = false
}: SupporterAgreementModalProps) {
  const [activeTab, setActiveTab] = useState<string>('summary');
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [showScrollPrompt, setShowScrollPrompt] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const fullAgreementRef = useRef<HTMLDivElement>(null);

  const effectiveDate = format(new Date(), 'MMMM d, yyyy');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('summary');
      setHasScrolledToBottom(false);
      setIsChecked(false);
      setShowScrollPrompt(false);
    }
  }, [open]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    
    // Consider scrolled to bottom if within 50px of bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (isAtBottom && activeTab === 'full') {
      setHasScrolledToBottom(true);
      setShowScrollPrompt(false);
    }
  }, [activeTab]);

  const handleAcceptClick = async () => {
    if (!hasScrolledToBottom) {
      setShowScrollPrompt(true);
      setActiveTab('full');
      return;
    }

    setIsAccepting(true);
    const success = await onAccept();
    setIsAccepting(false);
    
    if (success) {
      hapticSuccess();
      onOpenChange(false);
    }
  };

  // Auto-accept when checkbox is checked (if user has scrolled to bottom)
  const handleCheckboxChange = async (checked: boolean) => {
    setIsChecked(checked);
    
    if (checked && hasScrolledToBottom) {
      // Automatically trigger acceptance
      setIsAccepting(true);
      const success = await onAccept();
      setIsAccepting(false);
      
      if (success) {
        hapticSuccess();
        onOpenChange(false);
      }
    } else if (checked && !hasScrolledToBottom) {
      // Prompt user to scroll first
      setShowScrollPrompt(true);
      setActiveTab('full');
    }
  };

  const handleDownloadPDF = () => {
    // Create PDF content
    const content = `
WELILE TENANT SUPPORTER TERMS & CONDITIONS
(12-Month Supporter Participation Agreement)

Effective Date: ${effectiveDate}
Agreement Version: v1.0

${FULL_AGREEMENT_CONTENT}
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Welile_Supporter_Agreement_v1.0_${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Welile Supporter Agreement</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
              h1 { font-size: 24px; margin-bottom: 10px; }
              h2 { font-size: 18px; margin-top: 20px; }
              p { margin: 10px 0; }
              .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
              .meta { font-size: 14px; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>WELILE TENANT SUPPORTER TERMS & CONDITIONS</h1>
              <p class="meta">12-Month Supporter Participation Agreement</p>
              <p class="meta">Effective Date: ${effectiveDate} | Version: v1.0</p>
            </div>
            <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${FULL_AGREEMENT_CONTENT}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const canAccept = hasScrolledToBottom && isChecked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[95vh] max-h-[900px] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-xl"  >
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base sm:text-lg font-bold">
                  Supporter Participation Agreement
                </DialogTitle>
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                  Required
                </Badge>
              </div>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                12-Month Contract • Version v1.0
              </DialogDescription>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Effective Date: {effectiveDate}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 sm:px-6 pt-4 shrink-0">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="summary" className="gap-1.5 text-xs sm:text-sm">
                  <FileText className="h-3.5 w-3.5" />
                  Quick Summary
                </TabsTrigger>
                <TabsTrigger value="full" className="gap-1.5 text-xs sm:text-sm">
                  <FileCheck className="h-3.5 w-3.5" />
                  Full Agreement
                  {!hasScrolledToBottom && (
                    <Badge variant="outline" className="ml-1 text-[9px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30">
                      Read Required
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab Content */}
            <TabsContent value="summary" className="flex-1 min-h-0 mt-0 px-4 sm:px-6 data-[state=inactive]:hidden">
              <ScrollArea className="h-full pr-4 py-4">
                <div className="prose prose-sm max-w-none">
                  <div className="text-center mb-6 pb-4 border-b border-border">
                    <h3 className="text-lg font-bold text-foreground mb-1">
                      WELILE TENANT SUPPORTER AGREEMENT
                    </h3>
                    <p className="text-sm text-muted-foreground">Quick Summary (12 Months)</p>
                    <p className="text-xs text-muted-foreground italic mt-2">
                      This is a short summary for easier reading. The Full Agreement is the official binding document.
                    </p>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                    {QUICK_SUMMARY_CONTENT.split('\n\n').slice(1).map((section, idx) => (
                      <div key={idx} className="mb-4">
                        {section.split('\n').map((line, lineIdx) => {
                          if (line.match(/^\d+\)/)) {
                            return (
                              <h4 key={lineIdx} className="font-bold text-foreground mt-4 mb-2 flex items-center gap-2">
                                <span className="text-primary">{line.split(')')[0]})</span>
                                <span>{line.split(')').slice(1).join(')')}</span>
                              </h4>
                            );
                          }
                          return <p key={lineIdx} className="text-muted-foreground">{line}</p>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="full" className="flex-1 min-h-0 mt-0 px-4 sm:px-6 data-[state=inactive]:hidden relative">
              {/* Scroll indicator at top */}
              {!hasScrolledToBottom && (
                <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
              )}
              <div
                ref={fullAgreementRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto pr-4 py-4"
              >
                <div className="prose prose-sm max-w-none">
                  <div className="text-center mb-6 pb-4 border-b border-border">
                    <h3 className="text-lg font-bold text-foreground mb-1">
                      WELILE TENANT SUPPORTER TERMS & CONDITIONS
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      12-Month Supporter Participation Agreement
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>Effective: {effectiveDate}</span>
                      <span>•</span>
                      <span>Duration: 12 Months</span>
                      <span>•</span>
                      <span>v1.0</span>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                    {FULL_AGREEMENT_CONTENT.split('\n\n').slice(1).map((section, idx) => (
                      <div key={idx} className="mb-4">
                        {section.split('\n').map((line, lineIdx) => {
                          // Section headers
                          if (line.match(/^\d+\./)) {
                            return (
                              <h4 key={lineIdx} className="font-bold text-foreground mt-6 mb-3 text-base border-b border-border/50 pb-2">
                                {line}
                              </h4>
                            );
                          }
                          // Subsection headers
                          if (line.match(/^\d+\.\d+/)) {
                            return (
                              <p key={lineIdx} className="font-semibold text-foreground mt-3 mb-1">
                                {line}
                              </p>
                            );
                          }
                          // Bullet points
                          if (line.startsWith('•')) {
                            return (
                              <p key={lineIdx} className="text-muted-foreground pl-4 py-0.5">
                                {line}
                              </p>
                            );
                          }
                          return <p key={lineIdx} className="text-muted-foreground">{line}</p>;
                        })}
                      </div>
                    ))}
                  </div>
                  
                  {/* End marker */}
                  <div className="text-center py-8 border-t border-border mt-8">
                    <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      End of Agreement
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      You have read the complete agreement
                    </p>
                  </div>
                </div>
              </div>
              {/* Scroll indicator at bottom */}
              {!hasScrolledToBottom && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-2 pt-6 bg-gradient-to-t from-background via-background/90 to-transparent"
                >
                  <motion.div
                    animate={{ y: [0, 5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="flex flex-col items-center text-muted-foreground"
                  >
                    <ChevronRight className="h-5 w-5 rotate-90" />
                    <span className="text-xs font-medium">Scroll to continue</span>
                  </motion.div>
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-border bg-muted/30 p-3 sm:p-4 space-y-3">
          {/* Scroll Prompt */}
          <AnimatePresence>
            {showScrollPrompt && !hasScrolledToBottom && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30"
              >
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-xs sm:text-sm text-warning font-medium">
                  Please scroll to the bottom of the Full Agreement to accept.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTab('full')}
                  className="ml-auto text-xs gap-1 text-warning hover:text-warning hover:bg-warning/10"
                >
                  View Full Agreement
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download/Print Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              className="gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            
            {hasScrolledToBottom && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="ml-auto flex items-center gap-1.5 text-xs text-success font-medium"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Full Agreement Read</span>
              </motion.div>
            )}
          </div>

          {/* Checkbox */}
          <motion.div 
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-all duration-300",
              isChecked 
                ? "bg-success/10 border-success/50 ring-2 ring-success/20" 
                : "bg-background border-border"
            )}
            animate={isChecked ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Checkbox
              id="accept-terms"
              checked={isChecked}
              onCheckedChange={handleCheckboxChange}
              disabled={isAccepting || loading}
              className={cn("mt-0.5", isChecked && "data-[state=checked]:bg-success data-[state=checked]:border-success")}
            />
            <div className="flex-1">
              <label
                htmlFor="accept-terms"
                className="text-xs sm:text-sm text-foreground cursor-pointer leading-relaxed block"
              >
                I have read and agree to the <span className="font-semibold">Welile Tenant Supporter Terms & Conditions</span> (12-Month Contract), including the <span className="font-semibold text-primary">90-day withdrawal notice policy</span> and the <span className="font-semibold text-primary">Principal & Outcome Assurance Framework</span>.
              </label>
              <AnimatePresence>
                {isChecked && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-1.5 mt-2 text-success font-medium text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Agreement accepted! Click the button below to continue.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Accept Button */}
          <Button
            onClick={handleAcceptClick}
            disabled={!canAccept || isAccepting || loading}
            className={cn(
              "w-full h-12 font-bold text-sm gap-2 transition-all",
              canAccept 
                ? "bg-success hover:bg-success/90 shadow-lg shadow-success/25" 
                : "bg-muted text-muted-foreground"
            )}
          >
            {isAccepting || loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Accept & Continue
              </>
            )}
          </Button>

          {!canAccept && !showScrollPrompt && (
            <p className="text-xs text-center text-muted-foreground">
              {!hasScrolledToBottom 
                ? 'You must read the full agreement before accepting' 
                : 'Please check the box above to accept'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
