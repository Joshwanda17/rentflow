import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  MessageCircle, 
  Phone, 
  ChevronRight,
  Star,
  BadgeCheck,
  XCircle
} from 'lucide-react';
import BoringAvatar from 'boring-avatars';
import { MARBLE_COLORS } from '@/components/UserAvatar';
import { getWhatsAppLink } from '@/lib/phoneUtils';
import { hapticTap } from '@/lib/haptics';
import OnlineIndicator from '@/components/chat/OnlineIndicator';

interface SimpleUserCardProps {
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string | null;
    roles: string[];
    average_rating: number | null;
    rating_count: number;
    rent_discount_active?: boolean;
    verified?: boolean;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
  onClick: () => void;
  index: number;
  isOnline?: boolean;
}

const roleColors: Record<string, { bg: string; text: string; border: string }> = {
  tenant: { bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30' },
  agent: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' },
  supporter: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' },
  landlord: { bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30' },
  manager: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30' },
};

export function SimpleUserCard({ user, isSelected, onSelect, onClick, isOnline = false }: SimpleUserCardProps) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    window.open(getWhatsAppLink(user.phone), '_blank');
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    window.location.href = `tel:${user.phone}`;
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    onSelect(user.id);
  };

  const handleCardClick = () => {
    hapticTap();
    onClick();
  };

  return (
    <div
      onClick={handleCardClick}
      className={`relative bg-card rounded-2xl border-2 p-4 transition-colors cursor-pointer touch-manipulation ${
        isSelected 
          ? 'border-primary shadow-lg shadow-primary/10' 
          : 'border-border/50 active:bg-muted/50'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Top Row: Checkbox + Avatar + Info + Verified */}
      <div className="flex items-center gap-3">
        {/* Selection Checkbox - Large touch target */}
        <div 
          className="flex-shrink-0 p-2 -m-2"
          onClick={handleSelectClick}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${isSelected ? 'bg-primary/20' : 'bg-muted/50'}`}>
            <Checkbox
              checked={isSelected}
              className="h-6 w-6 rounded-lg"
            />
          </div>
        </div>

        {/* Avatar with Online Status */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-14 w-14 border-2 border-background shadow-md">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
              <BoringAvatar size={56} name={user.full_name} variant="marble" colors={MARBLE_COLORS} />
            </AvatarFallback>
          </Avatar>
          <OnlineIndicator 
            isOnline={isOnline} 
            size="md" 
            className="absolute bottom-0 right-0"
          />
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-base truncate">{user.full_name}</p>
            {user.verified ? (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <BadgeCheck className="h-4 w-4 text-purple-500 fill-purple-500/20" />
                <span className="text-[10px] text-purple-500 font-medium">Verified</span>
              </span>
            ) : (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <BadgeCheck className="h-4 w-4 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground font-medium">Unverified</span>
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{user.phone}</p>
          
          {/* Rating inline */}
          {user.rating_count > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-medium">{user.average_rating?.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({user.rating_count})</span>
            </div>
          )}
        </div>

        {/* View Details Arrow */}
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 rounded-xl bg-muted/30 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            hapticTap();
            onClick();
          }}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Roles Row */}
      <div className="flex flex-wrap gap-1.5 mt-3 ml-[72px]">
        {user.roles.map((role) => {
          const colors = roleColors[role] || { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
          return (
            <Badge 
              key={role} 
              variant="outline"
              className={`text-xs font-semibold px-2.5 py-1 ${colors.bg} ${colors.text} ${colors.border}`}
            >
              {role}
            </Badge>
          );
        })}
      </div>

      {/* Action Buttons - Full width, large touch targets */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
        <Button
          variant="outline"
          onClick={handleWhatsAppClick}
          className="flex-1 h-12 gap-2 bg-success/10 border-success/30 text-success active:bg-success/20 font-semibold text-base"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </Button>
        
        <Button
          variant="outline"
          onClick={handleCallClick}
          className="flex-1 h-12 gap-2 bg-primary/10 border-primary/30 text-primary active:bg-primary/20 font-semibold text-base"
        >
          <Phone className="h-5 w-5" />
          Call
        </Button>
      </div>
    </div>
  );
}