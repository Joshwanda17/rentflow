import { useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentAvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

/**
 * Agent avatar with graceful fallback: shows the photo when available and it
 * loads successfully; otherwise renders a neutral default placeholder (user
 * silhouette). Covers both "no picture" and "picture failed to load" cases.
 */
export function AgentAvatar({ src, name, className }: AgentAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;

  return (
    <div
      className={cn(
        'rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-muted-foreground',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={name ? `${name}` : 'Agent'}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <User className="h-1/2 w-1/2" strokeWidth={2} />
      )}
    </div>
  );
}
