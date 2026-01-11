import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hapticTap } from '@/lib/haptics';

export function FloatingShareButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    hapticTap();
    navigate('/install');
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      className="fixed bottom-40 right-4 md:bottom-20 md:right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-r from-success to-success/80 text-success-foreground shadow-lg flex items-center justify-center select-none"
      style={{ 
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        boxShadow: '0 4px 14px hsl(var(--success) / 0.4)'
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label="Share App"
    >
      <Share2 className="h-5 w-5 pointer-events-none" />
    </motion.button>
  );
}