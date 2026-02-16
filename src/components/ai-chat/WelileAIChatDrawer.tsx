import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Trash2, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWelileAI } from '@/hooks/useWelileAI';
import ReactMarkdown from 'react-markdown';
import ShareWelileAIBanner from './ShareWelileAIBanner';

const EarningPredictionCard = lazy(() => import('@/components/ai-chat/EarningPredictionCard'));

const QUICK_REPLIES = [
  "How do I earn more?",
  "Why was my receipt rejected?",
  "Become a Partner",
  "Withdraw earnings",
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

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleQuickReply = (text: string) => {
    if (isLoading) return;
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[70]"
            onClick={() => onOpenChange(false)}
          />

          {/* Chat panel */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              "fixed inset-0 md:inset-auto md:bottom-4 md:right-4",
              "md:w-[420px] md:h-[600px] md:rounded-2xl",
              "bg-background z-[71] flex flex-col",
              "shadow-2xl md:border border-border overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-primary/5">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Welile AI</h3>
                <p className="text-xs text-muted-foreground">Your growth & earnings assistant</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (confirm('Clear all chat history?')) clearHistory();
                }}
                title="Clear history"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Earning Prediction */}
            <Suspense fallback={null}>
              <EarningPredictionCard />
            </Suspense>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {messages.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">Welcome to Welile AI! 👋</h4>
                  <p className="text-sm text-muted-foreground mb-6">
                    I'm here to help you grow your earnings on Welile. Ask me anything!
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {QUICK_REPLIES.map((text) => (
                      <button
                        key={text}
                        onClick={() => handleQuickReply(text)}
                        className="px-3 py-2 text-xs rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className="space-y-1">
                  <div
                    className={cn(
                      "flex gap-2",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-md'
                          : 'bg-muted text-foreground rounded-tl-md'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  {/* Share CTA after every assistant message */}
                  {msg.role === 'assistant' && msg.id !== 'streaming' && (
                    <div className="ml-9 max-w-[80%]">
                      <ShareWelileAIBanner />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex gap-2 items-start">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Quick replies at bottom when conversation exists */}
            {messages.length > 0 && !isLoading && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
                {QUICK_REPLIES.map((text) => (
                  <button
                    key={text}
                    onClick={() => handleQuickReply(text)}
                    className="px-3 py-1.5 text-xs rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t bg-background">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Welile AI..."
                  rows={1}
                  className={cn(
                    "flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5",
                    "text-base md:text-sm placeholder:text-muted-foreground",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    "max-h-24 touch-manipulation"
                  )}
                  style={{ minHeight: '42px' }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-xl flex-shrink-0"
                  onClick={isLoading ? cancelStream : handleSend}
                  disabled={!isLoading && !input.trim()}
                >
                  {isLoading ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
