import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import welileLogo from '@/assets/welile-logo.png';

interface WelileLogoProps {
  showText?: boolean;
  className?: string;
  linkToHome?: boolean;
}

export default function WelileLogo({ showText = true, className = '', linkToHome = true }: WelileLogoProps) {
  const content = (
    <motion.div 
      className={`flex items-center gap-2 ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, duration: 0.4 }}
    >
      <motion.img 
        src={welileLogo} 
        alt="Welile" 
        className="h-8 w-auto"
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      />
      {showText && <span className="text-xl text-foreground" style={{ fontFamily: "'Chewy', cursive" }}>Welile.com</span>}
    </motion.div>
  );

  if (linkToHome) {
    return (
      <Link to="/" className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
