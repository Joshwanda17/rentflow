import { useState } from 'react';
import { parsePhoneNumber, PhoneInfo } from '@/lib/phoneUtils';
import { MessageCircle, CheckCircle, HelpCircle, ExternalLink, Check, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WhatsAppPhoneLinkProps {
  phone: string;
  className?: string;
  showFlag?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  whatsappVerified?: boolean;
  showVerificationStatus?: boolean;
  onVerifyClick?: () => void;
}

export default function WhatsAppPhoneLink({ 
  phone, 
  className = '', 
  showFlag = true,
  showIcon = true,
  size = 'md',
  whatsappVerified = false,
  showVerificationStatus = false,
  onVerifyClick
}: WhatsAppPhoneLinkProps) {
  const phoneInfo = parsePhoneNumber(phone);
  
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  
  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={phoneInfo.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-1.5 text-foreground hover:text-[#25D366] transition-colors group ${textSize} ${className}`}
            >
              {showFlag && !phoneInfo.isUgandan && (
                <span className="text-xs" title={phoneInfo.countryName}>
                  {phoneInfo.countryFlag}
                </span>
              )}
              <span className="group-hover:underline">{phone}</span>
              {showIcon && (
                <MessageCircle className={`${iconSize} text-[#25D366] opacity-0 group-hover:opacity-100 transition-opacity`} />
              )}
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#25D366]" />
            <span>
              Chat on WhatsApp
              {!phoneInfo.isUgandan && (
                <span className="text-muted-foreground ml-1">
                  ({phoneInfo.countryFlag} {phoneInfo.countryName})
                </span>
              )}
            </span>
          </TooltipContent>
        </Tooltip>
        
        {showVerificationStatus && (
          <Tooltip>
            <TooltipTrigger asChild>
              {whatsappVerified ? (
                <span className="inline-flex items-center gap-1 text-[#25D366]">
                  <CheckCircle className="h-4 w-4" />
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Open WhatsApp to verify manually
                    window.open(phoneInfo.whatsappLink, '_blank');
                    onVerifyClick?.();
                  }}
                  className="h-6 px-2 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                >
                  <HelpCircle className="h-3 w-3" />
                  Verify
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent side="top">
              {whatsappVerified ? (
                <span className="text-[#25D366]">✓ Verified on WhatsApp</span>
              ) : (
                <span>Click to verify if this number is on WhatsApp</span>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

// Compact verification badge for lists with confirmation flow
export function WhatsAppVerificationBadge({ 
  verified, 
  phone,
  onVerify,
  onMarkVerified,
  onMarkNotOnWhatsApp,
  size = 'sm'
}: { 
  verified: boolean; 
  phone: string;
  onVerify?: () => void;
  onMarkVerified?: () => void;
  onMarkNotOnWhatsApp?: () => void;
  size?: 'sm' | 'lg';
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const phoneInfo = parsePhoneNumber(phone);

  const isLg = size === 'lg';
  
  if (verified) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366]/15 text-[#25D366] font-semibold ${isLg ? 'text-sm' : 'text-xs'}`}>
        <MessageCircle className={isLg ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        On WhatsApp ✓
      </span>
    );
  }
  
  // Show confirmation buttons after checking
  if (showConfirm) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 ${isLg ? 'text-sm' : 'text-xs'}`} onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground font-medium">On WA?</span>
        <Button
          variant="ghost"
          size="sm"
          className={`${isLg ? 'h-8 w-8' : 'h-7 w-7'} p-0 rounded-full text-[#25D366] hover:bg-[#25D366]/15 active:scale-95`}
          onClick={(e) => {
            e.stopPropagation();
            onMarkVerified?.();
            setShowConfirm(false);
          }}
          title="Yes, verified on WhatsApp"
        >
          <Check className={isLg ? 'h-5 w-5' : 'h-4 w-4'} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${isLg ? 'h-8 w-8' : 'h-7 w-7'} p-0 rounded-full text-destructive hover:bg-destructive/15 active:scale-95`}
          onClick={(e) => {
            e.stopPropagation();
            onMarkNotOnWhatsApp?.();
            setShowConfirm(false);
          }}
          title="No, not on WhatsApp"
        >
          <X className={isLg ? 'h-5 w-5' : 'h-4 w-4'} />
        </Button>
      </div>
    );
  }
  
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`${isLg ? 'h-9 px-4 text-sm' : 'h-7 px-3 text-xs'} gap-1.5 rounded-full font-semibold text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 dark:text-amber-400 active:scale-95 touch-manipulation`}
      onClick={(e) => {
        e.stopPropagation();
        window.open(phoneInfo.whatsappLink, '_blank');
        onVerify?.();
        setTimeout(() => setShowConfirm(true), 1000);
      }}
    >
      <ExternalLink className={isLg ? 'h-4 w-4' : 'h-3 w-3'} />
      Check WA
    </Button>
  );
}