import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function FloatingShareButton() {
  const navigate = useNavigate();

  return (
    <motion.button
      onClick={() => navigate('/install')}
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 flex items-center justify-center hover:shadow-xl hover:shadow-green-500/40 transition-shadow"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Share App"
    >
      <Share2 className="h-5 w-5" />
    </motion.button>
  );
}