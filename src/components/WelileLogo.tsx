import { Link } from 'react-router-dom';
import welileLogo from '@/assets/welile-logo.png';

interface WelileLogoProps {
  showText?: boolean;
  className?: string;
  linkToHome?: boolean;
}

export default function WelileLogo({ showText = true, className = '', linkToHome = true }: WelileLogoProps) {
  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={welileLogo} alt="Welile" className="h-8 w-auto" />
      {showText && <span className="font-bold text-lg">Welile</span>}
    </div>
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
