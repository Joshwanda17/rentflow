import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, RotateCcw, Bot, User, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWelileAI } from '@/hooks/useWelileAI';
import ReactMarkdown from 'react-markdown';
import ShareWelileAIBanner from './ShareWelileAIBanner';

const EarningPredictionCard = lazy(() => import('@/components/ai-chat/EarningPredictionCard'));

const SUGGESTIONS = [
  { icon: "💰", text: "How do I earn more?" },
  { icon: "🧾", text: "Why was my receipt rejected?" },
  { icon: "🤝", text: "Become a Partner" },
  { icon: "💸", text: "Withdraw earnings" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function WelileAIChatDrawer({ open, onOpenChange }: Props) {
  const { messages, isLoading, sendMessage, clearHistory, cancelStream } = useWelileAI();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 100);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[70]"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              "fixed inset-0 md:inset-auto md:bottom-4 md:right-4",
              "md:w-[480px] md:h-[640px] md:rounded-2xl",
              "bg-background z-[71] flex flex-col",
              "shadow-2xl md:border border-border overflow-hidden"
            )}
          >
            {/* Minimal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Welile AI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Beta</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => { if (confirm('Start a new chat?')) clearHistory(); }}
                  title="New chat"
                >
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Main content area */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
            >
              {!hasMessages && !isLoading ? (
                /* ChatGPT-style empty state */
                <div className="flex flex-col items-center justify-center h-full px-6">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <Bot className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">How can I help you earn?</h2>
                  <p className="text-sm text-muted-foreground text-center mb-8 max-w-[280px]">
                    Ask me about earnings, receipts, referrals, or anything on Welile.
                  </p>

                  {/* Earning prediction inline */}
                  <Suspense fallback={null}>
                    <div className="w-full max-w-[340px] mb-4">
                      <EarningPredictionCard />
                    </div>
                  </Suspense>

                  {/* Suggestion grid */}
                  <div className="grid grid-cols-2 gap-2 w-full max-w-[340px]">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.text}
                        onClick={() => sendMessage(s.text)}
                        className="flex items-start gap-2 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-colors text-left group"
                      >
                        <span className="text-base leading-none mt-0.5">{s.icon}</span>
                        <span className="text-xs text-foreground/80 group-hover:text-foreground leading-snug">{s.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Messages */
                <div className="max-w-[680px] mx-auto w-full">
                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <div
                        className={cn(
                          "px-4 md:px-6 py-4",
                          msg.role === 'assistant' ? 'bg-transparent' : 'bg-transparent'
                        )}
                      >
                        <div className="flex gap-3 max-w-full">
                          {/* Avatar */}
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                            msg.role === 'assistant' 
                              ? 'bg-primary/10 border border-primary/20' 
                              : 'bg-foreground/10'
                          )}>
                            {msg.role === 'assistant' ? (
                              <Bot className="h-4 w-4 text-primary" />
                            ) : (
                              <User className="h-4 w-4 text-foreground/70" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground/60 mb-1">
                              {msg.role === 'assistant' ? 'Welile AI' : 'You'}
                            </p>
                            {msg.role === 'assistant' ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&>p]:mb-2.5 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>ul]:pl-4 [&>ol]:pl-4 [&_li]:mb-1">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Share banner after assistant messages */}
                      {msg.role === 'assistant' && msg.id !== 'streaming' && (
                        <div className="px-4 md:px-6 pb-2 pl-14 md:pl-16">
                          <ShareWelileAIBanner />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                    <div className="px-4 md:px-6 py-4">
                      <div className="flex gap-3">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground/60 mb-1">Welile AI</p>
                          <div className="flex gap-1 py-2">
                            <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0ms]" />
                            <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:150ms]" />
                            <span className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom spacing */}
                  <div className="h-4" />
                </div>
              )}
            </div>

            {/* Scroll to bottom */}
            <AnimatePresence>
              {showScrollDown && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  onClick={scrollToBottom}
                  className="absolute bottom-28 left-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-background border border-border shadow-lg flex items-center justify-center z-10"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* ChatGPT-style input area */}
            <div className="px-3 pb-3 pt-2">
              <div className="relative flex items-end rounded-2xl border border-border/80 bg-muted/30 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Welile AI..."
                  rows={1}
                  className={cn(
                    "flex-1 resize-none bg-transparent px-4 py-3 pr-12",
                    "text-base md:text-sm placeholder:text-muted-foreground/60",
                    "focus:outline-none",
                    "max-h-32 touch-manipulation"
                  )}
                  style={{ minHeight: '44px' }}
                />
                <button
                  onClick={isLoading ? cancelStream : handleSend}
                  disabled={!isLoading && !input.trim()}
                  className={cn(
                    "absolute right-2 bottom-2 h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                    (isLoading || input.trim())
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-foreground/10 text-foreground/30"
                  )}
                >
                  {isLoading ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground/50 mt-1.5">
                Welile AI can make mistakes. Verify important info.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
