import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  MessageCircle, 
  Phone, 
  UserCog, 
  ChevronRight,
  Star,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
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

export function SimpleUserCard({ user, isSelected, onSelect, onClick, index, isOnline = false }: SimpleUserCardProps) {
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
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2) }}
      onClick={handleCardClick}
      className={`relative bg-card rounded-2xl border-2 p-4 transition-all active:scale-[0.98] cursor-pointer ${
        isSelected 
          ? 'border-primary shadow-lg shadow-primary/10' 
          : 'border-border/50 hover:border-primary/40 hover:shadow-md'
      }`}
    >
      {/* Selection Checkbox - Large touch target */}
      <div 
        className="absolute left-3 top-3 z-10"
        onClick={handleSelectClick}
      >
        <div className={`p-1 rounded-lg transition-colors ${isSelected ? 'bg-primary/20' : 'bg-muted/50'}`}>
          <Checkbox
            checked={isSelected}
            className="h-5 w-5 rounded-md"
          />
        </div>
      </div>

      {/* Verified Badge */}
      <div className="absolute right-3 top-3">
        {user.verified ? (
          <div className="p-1.5 rounded-full bg-success/20" title="Verified">
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
        ) : (
          <div className="p-1.5 rounded-full bg-warning/20" title="Pending Verification">
            <XCircle className="h-4 w-4 text-warning" />
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="flex items-start gap-3 pl-8">
        <div className="relative">
          <Avatar className="h-14 w-14 border-2 border-background shadow-lg">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          {/* Online Status Indicator */}
          <OnlineIndicator 
            isOnline={isOnline} 
            size="md" 
            className="absolute bottom-0 right-0"
          />
        </div>

        <div className="flex-1 min-w-0">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              hapticTap();
              onClick();
            }}
            className="font-bold text-base truncate pr-8 text-primary hover:underline underline-offset-2 text-left w-full"
          >
            {user.full_name}
          </button>
          <p className="text-sm text-muted-foreground truncate">{user.phone}</p>
          
          {/* Roles */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {user.roles.map((role) => {
              const colors = roleColors[role] || { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
              return (
                <Badge 
                  key={role} 
                  variant="outline"
                  className={`text-xs font-semibold px-2 py-0.5 ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {role}
                </Badge>
              );
            })}
          </div>

          {/* Rating */}
          {user.rating_count > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-medium">{user.average_rating?.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({user.rating_count})</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Large and Clear */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          onClick={handleWhatsAppClick}
          className="flex-1 h-11 gap-2 bg-success/10 border-success/30 text-success hover:bg-success/20 hover:text-success font-semibold"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleCallClick}
          className="flex-1 h-11 gap-2 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:text-primary font-semibold"
        >
          <Phone className="h-5 w-5" />
          Call
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-xl bg-muted/50 hover:bg-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}
