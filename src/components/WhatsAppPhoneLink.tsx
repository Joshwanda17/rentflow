import { parsePhoneNumber, PhoneInfo } from '@/lib/phoneUtils';
import { MessageCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WhatsAppPhoneLinkProps {
  phone: string;
  className?: string;
  showFlag?: boolean;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export default function WhatsAppPhoneLink({ 
  phone, 
  className = '', 
  showFlag = true,
  showIcon = true,
  size = 'md'
}: WhatsAppPhoneLinkProps) {
  const phoneInfo = parsePhoneNumber(phone);
  
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  
  return (
    <TooltipProvider>
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
    </TooltipProvider>
  );
}
