import { useState, useEffect, useRef } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import WelileAIChatDrawer from './WelileAIChatDrawer';

const STORAGE_KEY = 'welile-ai-btn-pos';

interface Position { x: number; y: number; }

const GeminiSparkle = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 2C14 2 16.5 9 18.5 11.5C20.5 14 26 14 26 14C26 14 20.5 14 18.5 16.5C16.5 19 14 26 14 26C14 26 11.5 19 9.5 16.5C7.5 14 2 14 2 14C2 14 7.5 14 9.5 11.5C11.5 9 14 2 14 2Z"
      fill="currentColor"
    />
  </svg>
);

// Inline trigger for embedding in cards (e.g. wallet header)
export function WelileAITrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.15, rotate: 15 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className={cn(
          "h-9 w-9 rounded-full",
          "bg-gradient-to-br from-primary to-primary/80",
          "text-primary-foreground",
          "shadow-lg shadow-primary/30",
          "flex items-center justify-center",
          "transition-shadow duration-200",
          "hover:shadow-primary/50",
        )}
        aria-label="Open Welile AI"
      >
        <GeminiSparkle size={18} />
      </motion.button>
      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

// Global floating button — draggable, visible everywhere
export default function WelileAIChatButton() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Load saved position
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPosition(JSON.parse(saved));
    } catch {}
  }, []);

  const handleClick = () => {
    if (!isDragging) setOpen(true);
  };

  const handleDragStart = () => setIsDragging(true);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setTimeout(() => setIsDragging(false), 100);
    const newPos = { x: position.x + info.offset.x, y: position.y + info.offset.y };
    setPosition(newPos);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos)); } catch {}
  };

  return (
    <>
      {/* Drag constraints */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[59]" />

      <motion.button
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        initial={{ scale: 0, opacity: 0, x: position.x, y: position.y }}
        animate={{ scale: 1, opacity: 1, x: position.x, y: position.y }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        whileHover={{ scale: isDragging ? 1 : 1.08 }}
        whileTap={{ scale: 0.93 }}
        whileDrag={{ scale: 1.12, cursor: 'grabbing' }}
        onClick={handleClick}
        className={cn(
          "fixed bottom-20 right-4 z-[60]",
          "h-14 px-4 rounded-full",
          "bg-gradient-to-r from-primary via-primary to-purple-400",
          "text-primary-foreground",
          "shadow-xl shadow-primary/40",
          "flex items-center gap-2",
          "hover:shadow-2xl hover:shadow-primary/50",
          "transition-shadow duration-200",
          "cursor-grab active:cursor-grabbing touch-none",
          "border-2 border-primary-foreground/20"
        )}
        aria-label="Open Welile AI (drag to move)"
      >
        <GeminiSparkle size={22} />
        <span className="font-bold text-sm whitespace-nowrap">Welile AI</span>
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full animate-ping bg-primary/15 pointer-events-none" style={{ animationDuration: '3s' }} />
        {/* Glow */}
        <span className="absolute inset-0 rounded-full bg-primary/20 blur-md -z-10 pointer-events-none" />
      </motion.button>

      <WelileAIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}

// Standalone page trigger — opens drawer immediately when /ai is visited
export function WelileAIPage() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();

  return (
    <WelileAIChatDrawer
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) navigate('/welcome');
      }}
    />
  );
}
