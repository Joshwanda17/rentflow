import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface UserAvatarProps {
  avatarUrl?: string | null;
  fullName?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Generates a deterministic DiceBear "bottts" avatar URL based on a seed string.
 * These are robot/fintech-themed avatars that look finance-related.
 */
function getRandomAvatarUrl(seed: string): string {
  const encoded = encodeURIComponent(seed.trim().toLowerCase());
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encoded}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

export function UserAvatar({ avatarUrl, fullName, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16'
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-8 w-8'
  };

  // Use uploaded avatar, or generate a deterministic robot avatar from the name
  const effectiveAvatarUrl = avatarUrl || (fullName ? getRandomAvatarUrl(fullName) : undefined);

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      <AvatarImage src={effectiveAvatarUrl || undefined} alt={fullName || 'User avatar'} />
      <AvatarFallback className="bg-primary/10 text-primary">
        <User className={iconSizes[size]} />
      </AvatarFallback>
    </Avatar>
  );
}
